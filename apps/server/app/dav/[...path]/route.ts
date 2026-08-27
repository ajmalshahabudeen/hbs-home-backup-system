import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { auth } from "@workspace/auth";
import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { decryptAtRestToBuffer } from "@/lib/at-rest";
import { ensureUserDir, resolveUserPath, toPosixRel } from "@/lib/storage";
import { term } from "@/lib/term-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function sessionFromRequest(request: NextRequest) {
  term("DAV", "→ sessionFromRequest");
  const header = request.headers.get("authorization") || "";
  const basic = header.match(/^Basic\s+(.+)$/i);
  if (basic?.[1]) {
    const decoded = Buffer.from(basic[1], "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const email = decoded.slice(0, idx).trim().toLowerCase();
    const token = decoded.slice(idx + 1).trim();
    if (email && token) {
      const row = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });
      if (
        row &&
        row.user.email.toLowerCase() === email &&
        row.expiresAt.getTime() > Date.now()
      ) {
        term("DAV", "← basic auth ok", { user: row.user.email });
        return row.user;
      }
    }
  }
  const session = await auth.api.getSession({ headers: request.headers });
  term("DAV", session?.user ? "← cookie auth ok" : "← auth miss", {
    user: session?.user?.email,
  });
  return session?.user ?? null;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function davHref(rel: string) {
  const clean = toPosixRel(rel);
  return `/dav/${clean.split("/").map(encodeURIComponent).join("/")}${clean ? "" : ""}`;
}

export const OPTIONS = withApiLog("OPTIONS /dav/[...path]", async () => {
  return new Response(null, {
    status: 200,
    headers: {
      DAV: "1, 2",
      Allow: "OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE, MKCOL, MOVE",
      "MS-Author-Via": "DAV",
    },
  });
});

export const GET = withApiLog(
  "GET /dav/[...path]",
  async (
    request: NextRequest,
    context: { params: Promise<{ path?: string[] }> },
  ) => {
    return handleRead(request, context, false);
  },
);

export const HEAD = withApiLog(
  "HEAD /dav/[...path]",
  async (
    request: NextRequest,
    context: { params: Promise<{ path?: string[] }> },
  ) => {
    return handleRead(request, context, true);
  },
);

async function handleRead(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
  headOnly: boolean,
) {
  const user = await sessionFromRequest(request);
  if (!user)
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="HBS Cloud"' },
    });
  const params = await context.params;
  const rel = toPosixRel((params.path || []).map(decodeURIComponent).join("/"));
  const abs = resolveUserPath(user.id, rel);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    return new Response("Not found", { status: 404 });
  }
  const head = Buffer.alloc(4);
  const fd = fs.openSync(abs, "r");
  fs.readSync(fd, head, 0, 4, 0);
  fs.closeSync(fd);
  if (head.toString("utf8") === "HBS2") {
    const plain = await decryptAtRestToBuffer(abs);
    return new Response(headOnly ? null : new Uint8Array(plain), {
      headers: {
        "Content-Length": String(plain.length),
        "Content-Type": "application/octet-stream",
      },
    });
  }
  const stat = fs.statSync(abs);
  if (headOnly) {
    return new Response(null, {
      headers: { "Content-Length": String(stat.size) },
    });
  }
  const stream = fs.createReadStream(abs);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: { "Content-Length": String(stat.size) },
  });
}

export const PUT = withApiLog(
  "PUT /dav/[...path]",
  async (
    request: NextRequest,
    context: { params: Promise<{ path?: string[] }> },
  ) => {
    const user = await sessionFromRequest(request);
    if (!user)
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="HBS Cloud"' },
      });
    const params = await context.params;
    const rel = toPosixRel(
      (params.path || []).map(decodeURIComponent).join("/"),
    );
    if (!rel) return new Response("Path required", { status: 400 });
    ensureUserDir(user.id);
    const abs = resolveUserPath(user.id, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const buf = Buffer.from(await request.arrayBuffer());
    fs.writeFileSync(abs, buf);
    const name = path.posix.basename(rel);
    const parentPath = rel.includes("/")
      ? rel.slice(0, rel.lastIndexOf("/"))
      : "";
    await prisma.backupFile.upsert({
      where: { userId_path: { userId: user.id, path: rel } },
      create: {
        userId: user.id,
        path: rel,
        name,
        parentPath,
        isDir: false,
        size: BigInt(buf.length),
        searchName: name.toLowerCase(),
      },
      update: {
        size: BigInt(buf.length),
        name,
        searchName: name.toLowerCase(),
      },
    });
    return new Response(null, { status: 201 });
  },
);

export const DELETE = withApiLog(
  "DELETE /dav/[...path]",
  async (
    request: NextRequest,
    context: { params: Promise<{ path?: string[] }> },
  ) => {
    const user = await sessionFromRequest(request);
    if (!user)
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="HBS Cloud"' },
      });
    const params = await context.params;
    const rel = toPosixRel(
      (params.path || []).map(decodeURIComponent).join("/"),
    );
    if (!rel) return new Response("Path required", { status: 400 });
    const abs = resolveUserPath(user.id, rel);
    if (fs.existsSync(abs)) {
      fs.rmSync(abs, { recursive: true, force: true });
    }
    await prisma.backupFile.deleteMany({
      where: {
        userId: user.id,
        OR: [{ path: rel }, { path: { startsWith: `${rel}/` } }],
      },
    });
    return new Response(null, { status: 204 });
  },
);

export const MKCOL = withApiLog(
  "MKCOL /dav/[...path]",
  async (
    request: NextRequest,
    context: { params: Promise<{ path?: string[] }> },
  ) => {
    const user = await sessionFromRequest(request);
    if (!user)
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="HBS Cloud"' },
      });
    const params = await context.params;
    const rel = toPosixRel(
      (params.path || []).map(decodeURIComponent).join("/"),
    );
    if (!rel) return new Response("Path required", { status: 400 });
    const abs = resolveUserPath(user.id, rel);
    fs.mkdirSync(abs, { recursive: true });
    const name = path.posix.basename(rel);
    const parentPath = rel.includes("/")
      ? rel.slice(0, rel.lastIndexOf("/"))
      : "";
    await prisma.backupFile.upsert({
      where: { userId_path: { userId: user.id, path: rel } },
      create: {
        userId: user.id,
        path: rel,
        name,
        parentPath,
        isDir: true,
        size: BigInt(0),
      },
      update: { isDir: true },
    });
    return new Response(null, { status: 201 });
  },
);

export const PROPFIND = withApiLog(
  "PROPFIND /dav/[...path]",
  async (
    request: NextRequest,
    context: { params: Promise<{ path?: string[] }> },
  ) => {
    const user = await sessionFromRequest(request);
    if (!user)
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="HBS Cloud"' },
      });
    const params = await context.params;
    const rel = toPosixRel(
      (params.path || []).map(decodeURIComponent).join("/"),
    );
    const depth = request.headers.get("depth") || "1";
    const parent = rel;
    const rows = await prisma.backupFile.findMany({
      where:
        depth === "0"
          ? {
              userId: user.id,
              path: parent || undefined,
              ...(parent ? {} : { parentPath: "" }),
            }
          : { userId: user.id, parentPath: parent },
      orderBy: [{ isDir: "desc" }, { name: "asc" }],
    });
    const self = parent
      ? await prisma.backupFile.findFirst({
          where: { userId: user.id, path: parent },
        })
      : null;
    const entries = [
      ...(self
        ? [self]
        : [
            {
              path: "",
              name: "",
              isDir: true,
              size: 0n,
              updatedAt: new Date(),
            },
          ]),
      ...(depth === "0" ? [] : rows),
    ];
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${entries
  .map((e) => {
    const href = e.path ? davHref(e.path) : "/dav/";
    const isDir = Boolean(e.isDir);
    return `<D:response>
<D:href>${escapeXml(href.endsWith("/") || !isDir ? href : `${href}/`)}</D:href>
<D:propstat><D:prop>
<D:displayname>${escapeXml(e.name || "HBS")}</D:displayname>
<D:getlastmodified>${e.updatedAt.toUTCString()}</D:getlastmodified>
${isDir ? "<D:resourcetype><D:collection/></D:resourcetype>" : `<D:resourcetype/><D:getcontentlength>${Number(e.size)}</D:getcontentlength>`}
</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
</D:response>`;
  })
  .join("\n")}
</D:multistatus>`;
    return new Response(xml, {
      status: 207,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        DAV: "1, 2",
      },
    });
  },
);

export const MOVE = withApiLog(
  "MOVE /dav/[...path]",
  async (
    request: NextRequest,
    context: { params: Promise<{ path?: string[] }> },
  ) => {
    const user = await sessionFromRequest(request);
    if (!user)
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="HBS Cloud"' },
      });
    const destHeader = request.headers.get("destination") || "";
    const destPath = decodeURIComponent(
      destHeader.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/dav\/?/, ""),
    );
    const params = await context.params;
    const rel = toPosixRel(
      (params.path || []).map(decodeURIComponent).join("/"),
    );
    const destRel = toPosixRel(destPath);
    if (!rel || !destRel) return new Response("Bad MOVE", { status: 400 });
    const fromAbs = resolveUserPath(user.id, rel);
    const toAbs = resolveUserPath(user.id, destRel);
    if (!fs.existsSync(fromAbs))
      return new Response("Not found", { status: 404 });
    fs.mkdirSync(path.dirname(toAbs), { recursive: true });
    fs.renameSync(fromAbs, toAbs);
    const name = path.posix.basename(destRel);
    const parentPath = destRel.includes("/")
      ? destRel.slice(0, destRel.lastIndexOf("/"))
      : "";
    await prisma.backupFile.updateMany({
      where: { userId: user.id, path: rel },
      data: { path: destRel, name, parentPath, searchName: name.toLowerCase() },
    });
    return new Response(null, { status: 201 });
  },
);
