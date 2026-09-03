import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { badRequest, ok, requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog(
  "GET /api/user/backup/index",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const userId = session.user.id;

    try {
      const files = await prisma.backupFile.findMany({
        where: {
          userId,
          isDir: false,
        },
        select: {
          id: true,
          name: true,
          path: true,
          size: true,
          checksum: true,
          mimeType: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const items = files.map((file) => ({
        id: file.id,
        fileName: file.name,
        filePath: file.path,
        fileSize: Number(file.size),
        checksum: file.checksum || "",
        mimeType: file.mimeType || "",
        uploadedAt: file.createdAt.toISOString(),
      }));

      return ok({
        count: items.length,
        items,
      });
    } catch (e) {
      return badRequest(
        e instanceof Error ? e.message : "Failed to fetch backup index",
      );
    }
  },
);

export const POST = withApiLog(
  "POST /api/user/backup/index",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const userId = session.user.id;

    try {
      const body = await request.json();
      const rawItems = Array.isArray(body?.items) ? body.items : [];
      if (rawItems.length === 0) {
        return ok({ synced: 0 });
      }

      let synced = 0;
      for (const item of rawItems) {
        const name = String(item.fileName || item.name || "").trim();
        const path = String(item.filePath || item.path || name).trim();
        const size = BigInt(item.fileSize ?? item.size ?? 0);
        const checksum = String(item.checksum || "").trim();
        const mimeType = item.mimeType ? String(item.mimeType).trim() : null;

        if (!name || !path) continue;

        await prisma.backupFile.upsert({
          where: {
            userId_path: {
              userId,
              path,
            },
          },
          create: {
            userId,
            name,
            path,
            size,
            checksum,
            mimeType,
            isDir: false,
          },
          update: {
            size,
            ...(checksum ? { checksum } : {}),
            ...(mimeType ? { mimeType } : {}),
          },
        });
        synced++;
      }

      return ok({ synced });
    } catch (e) {
      return badRequest(
        e instanceof Error ? e.message : "Failed to sync backup index",
      );
    }
  },
);
