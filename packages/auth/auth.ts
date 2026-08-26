import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@workspace/db";
import { passkey } from "@better-auth/passkey";
import { admin } from "better-auth/plugins";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

const APP_PORT = process.env.PORT || process.env.APP_PORT || "38480";

const fallbackBaseURL = (
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  `http://localhost:${APP_PORT}`
).replace(/\/+$/, "");

const secret =
  process.env.BETTER_AUTH_SECRET ||
  "dev-only-change-me-hbs-backup-secret-32chars";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Home backup server = multi-client on the same LAN.
 * Clients hit the server via localhost, 127.0.0.1, 192.168.x.x, 10.x, 172.x, .local, etc.
 *
 * BETTER_AUTH_STRICT_ORIGINS=true → only explicit allowlists (no catch-all).
 * Default is open for private/LAN + loopback so Expo/Next/desktop never hit Invalid origin.
 */
const strictOrigins =
  process.env.BETTER_AUTH_STRICT_ORIGINS === "1" ||
  process.env.BETTER_AUTH_STRICT_ORIGINS === "true";

/** Extra public hosts for a future WAN mode: "backup.example.com,1.2.3.4" */
const publicHosts = (process.env.BETTER_AUTH_PUBLIC_HOSTS || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const protocolEnv = process.env.BETTER_AUTH_PROTOCOL;
const protocol: "http" | "https" | "auto" =
  protocolEnv === "http" || protocolEnv === "https" || protocolEnv === "auto"
    ? protocolEnv
    : "auto";

/**
 * Dynamic baseURL allowedHosts (host[:port] patterns).
 * Better Auth resolves the request Host header against this list.
 * @see https://www.better-auth.com/docs/guides/dynamic-base-url
 */
const allowedHosts: string[] = [
  // Loopback
  "localhost",
  "localhost:*",
  `localhost:${APP_PORT}`,
  "127.0.0.1",
  "127.0.0.1:*",
  `127.0.0.1:${APP_PORT}`,
  "0.0.0.0",
  "0.0.0.0:*",
  "[::1]",
  "[::1]:*",
  "::1",
  "::1:*",

  // RFC1918 private IPv4 (with + without non-default ports)
  "10.*.*.*",
  "10.*.*.*:*",
  "192.168.*.*",
  "192.168.*.*:*",
  // 172.16.0.0 – 172.31.255.255 (broader 172.* is OK for home server)
  "172.*.*.*",
  "172.*.*.*:*",

  // Link-local / APIPA
  "169.254.*.*",
  "169.254.*.*:*",

  // mDNS / .local hostnames common on home networks
  "*.local",
  "*.local:*",
  "*.lan",
  "*.lan:*",
  "*.home",
  "*.home:*",
  "*.internal",
  "*.internal:*",

  // Optional public / custom hosts (future WAN)
  ...publicHosts,
  ...publicHosts.flatMap((h) =>
    h.includes(":") ? [] : [`${h}:*`, `${h}:${APP_PORT}`]
  ),

  // Home mode: accept any host the client used to reach us (LAN IP of this PC, etc.)
  ...(strictOrigins ? [] : ["*", "*:*"]),
];

/**
 * Origin patterns for CSRF / Origin header checks.
 * Patterns with :// match full origins; others match host only.
 */
const staticTrustedOriginPatterns: string[] = [
  fallbackBaseURL,
  `http://localhost:${APP_PORT}`,
  `http://127.0.0.1:${APP_PORT}`,
  "http://localhost:*",
  "http://127.0.0.1:*",
  "http://[::1]:*",
  "http://10.*.*.*",
  "http://10.*.*.*:*",
  "http://192.168.*.*",
  "http://192.168.*.*:*",
  "http://172.*.*.*",
  "http://172.*.*.*:*",
  "http://169.254.*.*",
  "http://169.254.*.*:*",
  "http://*.local",
  "http://*.local:*",
  "http://*.lan",
  "http://*.lan:*",
  "https://localhost:*",
  "https://127.0.0.1:*",
  "https://10.*.*.*:*",
  "https://192.168.*.*:*",
  "https://172.*.*.*:*",
  "https://*.local:*",
  // Expo / React Native / future desktop deep links
  "exp://*",
  "exps://*",
  "hbsbackup://*",
  "hbscloud://*",
  "http://*",
  "https://*",
  ...(process.env.EXPO_SCHEME ? [`${process.env.EXPO_SCHEME}://*`] : []),
  ...(strictOrigins ? [] : ["*"]),
];

function isPrivateOrLocalHost(host: string): boolean {
  const raw = host.replace(/^\[|\]$/g, "").toLowerCase();
  const h = (raw.split("%")[0] || raw).trim();
  if (!h) return false;
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0"
  ) {
    return true;
  }
  if (h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home")) {
    return true;
  }
  // IPv4
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 127) return true;
  }
  // IPv6 ULA / link-local
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) {
    return true;
  }
  return false;
}

function originFromRequest(request?: Request): string[] {
  if (!request) return [];
  const out: string[] = [];
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== "null") {
      try {
        const u = new URL(origin);
        const hostname = u.hostname || "";
        if (
          !strictOrigins ||
          isPrivateOrLocalHost(hostname) ||
          publicHosts.some(
            (p) =>
              hostname === p ||
              u.host === p ||
              (p.length > 0 && hostname.endsWith(`.${p}`))
          )
        ) {
          out.push(origin);
        }
      } catch {
        out.push(origin);
      }
    }
    const hostHeader =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "";
    if (hostHeader) {
      const hostname = hostHeader.split(":")[0] || hostHeader;
      if (
        !strictOrigins ||
        isPrivateOrLocalHost(hostname) ||
        publicHosts.includes(hostHeader) ||
        publicHosts.includes(hostname)
      ) {
        out.push(`http://${hostHeader}`, `https://${hostHeader}`);
      }
    }
  } catch {
    // ignore
  }
  return out;
}

/**
 * Shared Better Auth instance for the monorepo.
 * Mounted on apps/server at /api/auth/[...all].
 * Dynamic baseURL: clients may open the admin UI via any LAN IP of this PC.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth: any = betterAuth({
  // Dynamic base URL — resolves from Host / X-Forwarded-* per request
  // https://www.better-auth.com/docs/guides/dynamic-base-url
  baseURL: {
    allowedHosts,
    protocol,
    fallback: fallbackBaseURL,
  },
  secret,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: googleClientId ? ["google"] : [],
    },
  },
  ...(googleClientId && googleClientSecret
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        },
      }
    : {}),
  advanced: {
    // Expo / RN / some WebViews omit Origin — do not block them
    disableCSRFCheck: true,
    // Home multi-client default: skip strict origin reject (set STRICT to re-enable)
    disableOriginCheck: !strictOrigins,
    // LAN often sits behind Caddy/nginx later; trust X-Forwarded-* when present
    trustedProxyHeaders: true,
    // Cookies over http://192.168.x.x must not require Secure
    useSecureCookies: process.env.BETTER_AUTH_SECURE_COOKIES === "true",
    defaultCookieAttributes: {
      sameSite: "lax" as const,
      secure: process.env.BETTER_AUTH_SECURE_COOKIES === "true",
      path: "/",
    },
  },
  /**
   * Function form + wildcards so any LAN client Origin is accepted.
   * Also merges the live request Origin/Host on every call.
   */
  trustedOrigins: async (request?: Request) => {
    const dynamic = originFromRequest(request);
    const extra = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(
      new Set(
        [...staticTrustedOriginPatterns, ...dynamic, ...extra].filter(Boolean)
      )
    );
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user: {
          role?: string | null;
          email?: string;
          name?: string;
          id?: string;
        }) => {
          const count = await prisma.user.count();
          if (count === 0) {
            return {
              data: {
                ...user,
                role: "admin",
              },
            };
          }
          return { data: user };
        },
        after: async (user: {
          email: string;
          name: string;
          id: string;
          role?: string | null;
        }) => {
          try {
            await prisma.systemLog.create({
              data: {
                level: "INFO",
                type: "REGISTER",
                status: "SUCCESS",
                message: `User registered: ${user.email} (${user.name}) role=${user.role ?? "user"}`,
                userEmail: user.email,
                userId: user.id,
              },
            });
          } catch {
            // ignore
          }
        },
      },
    },
    session: {
      create: {
        after: async (session: {
          userId: string;
          ipAddress?: string | null;
          userAgent?: string | null;
        }) => {
          try {
            const u = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { email: true },
            });
            await prisma.systemLog.create({
              data: {
                level: "INFO",
                type: "LOGIN",
                status: "SUCCESS",
                message: "User logged in",
                userId: session.userId,
                userEmail: u?.email,
                ipAddress: session.ipAddress ?? undefined,
                userAgent: session.userAgent ?? undefined,
              },
            });
          } catch {
            // ignore
          }
        },
      },
    },
  },
  plugins: [
    passkey(),
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    organization(),
    nextCookies(),
  ],
});

export type Session = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
    role?: string | null;
    banned?: boolean | null;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
  };
};
