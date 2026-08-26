"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function PasskeyRegisterPage() {
  const [msg, setMsg] = useState("Preparing passkey registration…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = new URLSearchParams(window.location.search).get("token");
        if (token) {
          const secure = window.location.protocol === "https:" ? "; Secure" : "";
          document.cookie = `better-auth.session_token=${token}; path=/; SameSite=Lax${secure}`;
        }
        setMsg("Touch your security key or use Windows Hello / Face ID…");
        const result = await authClient.passkey.addPasskey();
        if (cancelled) return;
        if (result.error) {
          setMsg(result.error.message || "Could not register passkey");
          return;
        }
        window.location.replace("/auth/flutter-bridge");
      } catch (e) {
        if (!cancelled) setMsg(e instanceof Error ? e.message : "Passkey registration failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F2EDE5",
        color: "#3F2A1D",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div>
        <h1>Register a passkey</h1>
        <p>{msg}</p>
      </div>
    </main>
  );
}
