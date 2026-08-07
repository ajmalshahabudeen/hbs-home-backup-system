import fs from "node:fs";
import path from "node:path";
import { redisGetBuffer, redisSetBuffer } from "@/lib/redis";

const THUMB_W = 360;
const THUMB_H = 360;
const THUMB_TTL = 60 * 60 * 24 * 14; // 14 days

function thumbKey(userId: string, relPath: string, mtimeMs: number): string {
  return `hbs:thumb:v1:${userId}:${relPath}:${mtimeMs}`;
}

/** Minimal gray JPEG placeholder (1x1) when generation fails. */
function placeholderJpeg(): Buffer {
  // tiny valid JPEG
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
    "base64"
  );
}

export async function getOrCreateThumbnail(opts: {
  userId: string;
  relPath: string;
  absPath: string;
  mimeType: string | null;
}): Promise<{ buffer: Buffer; contentType: string; cached: boolean }> {
  const { userId, relPath, absPath, mimeType } = opts;
  const st = fs.statSync(/* turbopackIgnore: true */ absPath);
  const key = thumbKey(userId, relPath, st.mtimeMs);

  const cached = await redisGetBuffer(key);
  if (cached && cached.length > 100) {
    return { buffer: cached, contentType: "image/jpeg", cached: true };
  }

  const isImage = mimeType?.startsWith("image/") ?? false;
  const isVideo = mimeType?.startsWith("video/") ?? false;

  try {
    if (isImage) {
      const sharp = (await import("sharp")).default;
      const buf = await sharp(/* turbopackIgnore: true */ absPath, {
        failOn: "none",
      })
        .rotate()
        .resize(THUMB_W, THUMB_H, {
          fit: "cover",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();

      await redisSetBuffer(key, buf, THUMB_TTL);
      // also write disk cache next to file
      try {
        const diskThumb = absPath + ".hbs-thumb.jpg";
        fs.writeFileSync(/* turbopackIgnore: true */ diskThumb, buf);
      } catch {
        // ignore disk cache write
      }
      return { buffer: buf, contentType: "image/jpeg", cached: false };
    }

    if (isVideo) {
      // Try disk-side cached thumb first
      const diskThumb = absPath + ".hbs-thumb.jpg";
      if (fs.existsSync(/* turbopackIgnore: true */ diskThumb)) {
        const buf = fs.readFileSync(/* turbopackIgnore: true */ diskThumb);
        await redisSetBuffer(key, buf, THUMB_TTL);
        return { buffer: buf, contentType: "image/jpeg", cached: true };
      }

      // Optional ffmpeg extraction if available on PATH
      try {
        const { execFileSync } = await import("node:child_process");
        const tmpOut = path.join(
          path.dirname(absPath),
          `.hbs-thumb-${Date.now()}.jpg`
        );
        execFileSync(
          "ffmpeg",
          [
            "-y",
            "-ss",
            "00:00:01",
            "-i",
            absPath,
            "-frames:v",
            "1",
            "-vf",
            `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=increase,crop=${THUMB_W}:${THUMB_H}`,
            tmpOut,
          ],
          { timeout: 15000, stdio: "ignore" }
        );
        if (fs.existsSync(/* turbopackIgnore: true */ tmpOut)) {
          const buf = fs.readFileSync(/* turbopackIgnore: true */ tmpOut);
          try {
            fs.renameSync(
              /* turbopackIgnore: true */ tmpOut,
              /* turbopackIgnore: true */ diskThumb
            );
          } catch {
            try {
              fs.unlinkSync(/* turbopackIgnore: true */ tmpOut);
            } catch {
              /* ignore */
            }
          }
          await redisSetBuffer(key, buf, THUMB_TTL);
          return { buffer: buf, contentType: "image/jpeg", cached: false };
        }
      } catch {
        // ffmpeg not available — fall through to placeholder
      }

      // Generate a simple branded placeholder via sharp
      try {
        const sharp = (await import("sharp")).default;
        const svg = `
          <svg width="${THUMB_W}" height="${THUMB_H}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#1e293b"/>
            <circle cx="50%" cy="48%" r="36" fill="#334155"/>
            <polygon points="170,150 170,210 230,180" fill="#e2e8f0"/>
            <text x="50%" y="88%" text-anchor="middle" fill="#94a3b8" font-size="18" font-family="sans-serif">VIDEO</text>
          </svg>`;
        const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toBuffer();
        await redisSetBuffer(key, buf, THUMB_TTL);
        try {
          fs.writeFileSync(/* turbopackIgnore: true */ diskThumb, buf);
        } catch {
          /* ignore */
        }
        return { buffer: buf, contentType: "image/jpeg", cached: false };
      } catch {
        const buf = placeholderJpeg();
        return { buffer: buf, contentType: "image/jpeg", cached: false };
      }
    }
  } catch (e) {
    console.warn("[HBS][THUMB] generate failed", relPath, e);
  }

  return {
    buffer: placeholderJpeg(),
    contentType: "image/jpeg",
    cached: false,
  };
}
