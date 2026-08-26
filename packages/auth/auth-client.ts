"use client";

import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";

/**
 * Prefer the page's actual origin (LAN IP / localhost) so cookies and
 * callback URLs match whatever address the user typed in the browser.
 * Override with NEXT_PUBLIC_APP_URL only when you intentionally pin a host.
 */
function resolveClientBaseURL(): string {
  if (typeof window !== "undefined") {
    // Always follow the address bar on the device (192.168.x.x, etc.)
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      return window.location.origin;
    }
    // If pinned URL is set but user opened via another LAN IP, still use window
    // unless STRICT client pin is requested.
    if (process.env.NEXT_PUBLIC_PIN_AUTH_URL === "true") {
      return process.env.NEXT_PUBLIC_APP_URL;
    }
    return window.location.origin;
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:38480"
  );
}

/**
 * Browser / Expo-web auth client.
 * Native Expo should pass the LAN server URL as baseURL + secure store later.
 */
export const authClient = createAuthClient({
  baseURL: resolveClientBaseURL(),
  plugins: [passkeyClient(), twoFactorClient(), adminClient(), organizationClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
