import { prisma } from "@workspace/db";

export async function sendPushToUser(userId: string, title: string, body: string) {
  try {
    const devices = await prisma.mobileDevice.findMany({
      where: { userId, NOT: { pushToken: null } },
    });
    for (const device of devices) {
      const token = (device.pushToken || "").trim();
      if (!token) continue;
      try {
        if (token.startsWith("ntfy:")) {
          await sendNtfy(token.slice(5), title, body);
        } else if (process.env.FCM_SERVER_KEY) {
          await sendFcm(token, title, body);
        }
      } catch {
        /* one device failing must not block others */
      }
    }
  } catch {
    /* ignore */
  }
}

async function sendNtfy(topic: string, title: string, body: string) {
  const clean = topic.replace(/^\/+/, "").replace(/[^a-zA-Z0-9._-]/g, "");
  if (!clean) return;
  const base = (process.env.NTFY_URL || "https://ntfy.sh").replace(/\/+$/, "");
  await fetch(`${base}/${encodeURIComponent(clean)}`, {
    method: "POST",
    headers: { Title: title, "Content-Type": "text/plain" },
    body,
  });
}

async function sendFcm(token: string, title: string, body: string) {
  const key = process.env.FCM_SERVER_KEY;
  if (!key) return;
  await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      notification: { title, body },
      data: { title, body },
      priority: "high",
    }),
  });
}
