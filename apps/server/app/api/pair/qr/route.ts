import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { withApiLog } from "@/lib/api-log";
import { getLanHostInfo } from "@/lib/lan-host";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog(
  "GET /api/pair/qr",
  async (request: NextRequest) => {
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "127.0.0.1:38480";
    const protoHeader = request.headers.get("x-forwarded-proto");
    const proto = protoHeader === "https" ? "https" : "http";
    const lan = getLanHostInfo();
    const publicUrl = (
      process.env.HBS_PUBLIC_URL ||
      ""
    ).replace(/\/+$/, "");
    const url = publicUrl || lan.url || `${proto}://${host}`.replace(/\/+$/, "");
    const payload = `hbscloud://pair?url=${encodeURIComponent(url)}`;
    const png = await QRCode.toBuffer(payload, {
      type: "png",
      width: 360,
      margin: 1,
    });
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-HBS-Pair-Url": url,
      },
    });
  },
);
