import http from "node:http";
import { prisma } from "@workspace/db";
import { WebSocket, WebSocketServer } from "ws";
import { extractCandidateSessionTokens } from "./auth-guard";
import { term } from "./term-log";

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  userEmail?: string;
  isAlive?: boolean;
  authTimeoutTimer?: ReturnType<typeof setTimeout>;
}

export interface DriveChangeEvent {
  userId: string;
  action:
    | "create"
    | "upload"
    | "rename"
    | "delete"
    | "trash"
    | "restore"
    | "batch"
    | "fs_change";
  path: string;
  file?: {
    id?: string;
    name?: string;
    path?: string;
    parentPath?: string;
    isDir?: boolean;
    size?: number;
    mimeType?: string | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
  };
  meta?: Record<string, unknown>;
  timestamp?: number;
}

let wss: WebSocketServer | null = null;
const userSockets = new Map<string, Set<AuthenticatedSocket>>();
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let hookInstalled = false;

/**
 * Validate a candidate token against the Prisma session database.
 */
async function authenticateToken(tokenCandidates: string[]): Promise<{
  userId: string;
  email: string;
  name: string | null;
} | null> {
  if (!tokenCandidates.length) return null;
  try {
    const session = await prisma.session.findFirst({
      where: {
        OR: [
          { token: { in: tokenCandidates } },
          { id: { in: tokenCandidates } },
        ],
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!session || !session.user) return null;
    if (session.user.banned) return null;

    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
  } catch (err) {
    term("ERROR", "ws token authentication error", { err });
    return null;
  }
}

/**
 * Register an authenticated socket for a given user.
 */
function registerUserSocket(userId: string, ws: AuthenticatedSocket) {
  let sockets = userSockets.get(userId);
  if (!sockets) {
    sockets = new Set();
    userSockets.set(userId, sockets);
  }
  sockets.add(ws);
  ws.userId = userId;
  term("WS", `user ${userId} connected (active: ${sockets.size})`);
}

/**
 * Unregister a socket on disconnect.
 */
function unregisterUserSocket(ws: AuthenticatedSocket) {
  if (ws.authTimeoutTimer) {
    clearTimeout(ws.authTimeoutTimer);
    ws.authTimeoutTimer = undefined;
  }
  if (ws.userId) {
    const sockets = userSockets.get(ws.userId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        userSockets.delete(ws.userId);
      }
      term(
        "WS",
        `user ${ws.userId} socket disconnected (remaining: ${sockets.size})`,
      );
    }
  }
}

const attachedServers = new WeakSet<http.Server>();

/**
 * Handle WebSocket upgrade request directly.
 * Returns true if the request was an HBS WebSocket upgrade and was handled.
 */
function handleUpgradeRequest(
  req: http.IncomingMessage,
  socket: any,
  head: Buffer,
): boolean {
  if (!wss) {
    initWebSocketServer();
  }
  if (!wss) return false;

  try {
    const host = req.headers.host || "localhost:38480";
    const url = new URL(req.url || "", `http://${host}`);
    const pathname = (url.pathname || "").replace(/\/+$/, "") || "/";

    // Only handle drive and user websocket paths
    if (
      pathname !== "/api/ws" &&
      pathname !== "/ws" &&
      pathname !== "/api/user/ws"
    ) {
      return false;
    }

    // Convert IncomingHttpHeaders to standard Headers
    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (Array.isArray(val)) {
        for (const v of val) headers.append(key, v);
      } else if (val !== undefined) {
        headers.set(key, val);
      }
    }

    // Extract tokens from query string and headers
    const urlToken =
      url.searchParams.get("token") ||
      url.searchParams.get("sessionToken") ||
      url.searchParams.get("auth_token");

    const rawCandidates = extractCandidateSessionTokens(undefined, headers);
    if (urlToken) rawCandidates.push(urlToken);

    // Perform upgrade
    wss.handleUpgrade(req, socket, head, (ws: AuthenticatedSocket) => {
      wss!.emit("connection", ws, req, rawCandidates);
    });
    return true;
  } catch (err) {
    term("ERROR", "ws upgrade handling error", { err });
    try {
      socket.destroy();
    } catch {}
    return true;
  }
}

/**
 * Attach WebSocket upgrade handling to a Node.js http.Server.
 */
export function attachWsToHttpServer(server: http.Server) {
  if (!server || attachedServers.has(server)) return;
  attachedServers.add(server);

  if (!wss) {
    initWebSocketServer();
  }

  server.on("upgrade", (req: http.IncomingMessage, socket, head) => {
    handleUpgradeRequest(req, socket, head);
  });

  server.on("close", () => {
    attachedServers.delete(server);
  });

  term("WS", "attached upgrade listener to HTTP server instance");
}

/**
 * Install global hooks on http.Server prototype so Next.js standalone and dev servers
 * intercept WebSocket upgrade requests even if server.listen was invoked before instrumentation.
 */
function installGlobalHook() {
  if (hookInstalled) return;
  hookInstalled = true;

  // 1. Hook http.Server.prototype.listen to capture any future servers
  const origListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function (
    this: http.Server,
    ...args: unknown[]
  ) {
    attachWsToHttpServer(this);
    return origListen.apply(this, args as never);
  };

  // 2. Hook http.Server.prototype.emit to intercept 'upgrade' events on ALL servers
  // (including servers created and listening before instrumentation runs)
  const origEmit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (
    this: http.Server,
    event: string,
    ...args: any[]
  ) {
    if (event === "upgrade") {
      const req = args[0] as http.IncomingMessage;
      const socket = args[1];
      const head = args[2] as Buffer;

      const handled = handleUpgradeRequest(req, socket, head);
      if (handled) {
        return true;
      }
    }

    attachWsToHttpServer(this);
    return origEmit.apply(this, [event, ...args] as any);
  };

  term("WS", "global HTTP upgrade hooks installed on http.Server prototype");
}

/**
 * Initialize the WebSocket server singleton.
 */
export function initWebSocketServer(
  explicitServer?: http.Server,
): WebSocketServer {
  if (wss) {
    if (explicitServer) {
      attachWsToHttpServer(explicitServer);
    }
    return wss;
  }

  wss = new WebSocketServer({ noServer: true });

  installGlobalHook();

  if (explicitServer) {
    attachWsToHttpServer(explicitServer);
  }

  // Support optional dedicated fallback port if specified in env
  const envWsPort = process.env.HBS_WS_PORT
    ? parseInt(process.env.HBS_WS_PORT, 10)
    : null;
  if (envWsPort && !Number.isNaN(envWsPort)) {
    try {
      const dedicatedWss = new WebSocketServer({ port: envWsPort }, () => {
        term("WS", `dedicated WebSocket server listening on port ${envWsPort}`);
      });
      dedicatedWss.on("connection", (ws, req) => {
        const url = new URL(req.url || "", `http://localhost:${envWsPort}`);
        const token = url.searchParams.get("token") || "";
        wss!.emit("connection", ws, req, token ? [token] : []);
      });
    } catch (err) {
      term("ERROR", `failed to bind dedicated ws port ${envWsPort}`, { err });
    }
  }

  // Handle incoming connections
  wss.on(
    "connection",
    async (
      ws: AuthenticatedSocket,
      req: http.IncomingMessage,
      rawCandidates: string[] = [],
    ) => {
      ws.isAlive = true;

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      // Attempt upfront authentication with extracted candidates
      const authResult = await authenticateToken(rawCandidates);
      if (authResult) {
        registerUserSocket(authResult.userId, ws);
        ws.send(
          JSON.stringify({
            event: "authenticated",
            data: {
              userId: authResult.userId,
              email: authResult.email,
              name: authResult.name,
            },
          }),
        );
      } else {
        // Allow 6 seconds for client to send `{ type: "auth", token: "..." }` message
        ws.authTimeoutTimer = setTimeout(() => {
          if (!ws.userId) {
            term("WS", "closing unauthenticated socket after timeout");
            ws.send(
              JSON.stringify({
                event: "error",
                data: { message: "Authentication timeout" },
              }),
            );
            ws.close(4401, "Unauthorized");
          }
        }, 6000);
      }

      ws.on("message", async (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          // 1. Heartbeat ping
          if (parsed.type === "ping" || parsed.event === "ping") {
            ws.send(
              JSON.stringify({
                event: "pong",
                data: { timestamp: Date.now() },
              }),
            );
            return;
          }

          // 2. Client auth message
          if (parsed.type === "auth" || parsed.event === "auth") {
            const token = (parsed.token || parsed.data?.token || "").toString();
            if (!token) {
              ws.send(
                JSON.stringify({
                  event: "error",
                  data: { message: "Missing token" },
                }),
              );
              return;
            }

            const user = await authenticateToken([token]);
            if (user) {
              if (ws.authTimeoutTimer) {
                clearTimeout(ws.authTimeoutTimer);
                ws.authTimeoutTimer = undefined;
              }
              registerUserSocket(user.userId, ws);
              ws.send(
                JSON.stringify({
                  event: "authenticated",
                  data: {
                    userId: user.userId,
                    email: user.email,
                    name: user.name,
                  },
                }),
              );
            } else {
              ws.send(
                JSON.stringify({
                  event: "error",
                  data: { message: "Invalid token" },
                }),
              );
              ws.close(4401, "Unauthorized");
            }
            return;
          }
        } catch {
          // Non-json or unrecognized message
        }
      });

      ws.on("close", () => {
        unregisterUserSocket(ws);
      });

      ws.on("error", (err) => {
        term("ERROR", "websocket client error", { err });
        unregisterUserSocket(ws);
      });
    },
  );

  // Heartbeat ping interval every 25 seconds to terminate dead sockets
  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      if (!wss) return;
      for (const client of wss.clients as Set<AuthenticatedSocket>) {
        if (client.isAlive === false) {
          unregisterUserSocket(client);
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, 25000);
  }

  term("WS", "WebSocket server initialized");
  return wss;
}

/**
 * Broadcast a real-time drive change event to all active sockets belonging to a user.
 */
export function broadcastDriveChange(event: DriveChangeEvent) {
  const sockets = userSockets.get(event.userId);
  if (!sockets || sockets.size === 0) {
    term(
      "WS",
      `broadcastDriveChange: no active sockets for user ${event.userId}`,
      {
        action: event.action,
        path: event.path,
      },
    );
    return;
  }

  const payload = JSON.stringify({
    event: "drive:change",
    data: {
      action: event.action,
      path: event.path,
      file: event.file,
      meta: event.meta,
      timestamp: event.timestamp || Date.now(),
    },
  });

  let sentCount = 0;
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
      sentCount++;
    }
  }

  term(
    "WS",
    `broadcastDriveChange: sent "${event.action}" on "${event.path}" to ${sentCount} socket(s)`,
  );
}

/**
 * Get active connection stats for monitoring.
 */
export function getWebSocketStats() {
  let totalConnections = 0;
  for (const set of userSockets.values()) {
    totalConnections += set.size;
  }
  return {
    totalConnections,
    activeUsers: userSockets.size,
  };
}
