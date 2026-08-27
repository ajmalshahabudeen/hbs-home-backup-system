import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { badRequest, ok, requireAdmin, writeLog } from "@/lib/auth-guard";
import { getLanHostInfo, saveLanHostname } from "@/lib/lan-host";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog("GET /api/admin/hostname", async (request: NextRequest) => {
  const { error } = await requireAdmin(request);
  if (error) return error;
  return ok(getLanHostInfo());
});

export const POST = withApiLog("POST /api/admin/hostname", async (request: NextRequest) => {
  const { session, error } = await requireAdmin(request);
  if (error) return error;
  let body: { hostname?: string } = {};
  try {
    body = (await request.json()) as { hostname?: string };
  } catch {
    return badRequest("JSON body required");
  }
  try {
    const hostname = saveLanHostname(String(body.hostname || ""));
    await writeLog({
      type: "HOSTNAME",
      message: `LAN hostname set to ${hostname}`,
      userId: session!.user.id,
    });
    return ok(getLanHostInfo());
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Invalid hostname");
  }
});
