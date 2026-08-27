import { term } from "@/lib/term-log";

/** LAN-only: no FCM, ntfy, or other outbound push. Inbox + SSE stay on the box. */
export async function sendPushToUser(
  _userId: string,
  _title: string,
  _body: string,
) {
  term(
    "PUSH",
    "LAN no-op (inbox/SSE only)",
    { userId: _userId, title: _title },
    "trace",
  );
  return;
}
