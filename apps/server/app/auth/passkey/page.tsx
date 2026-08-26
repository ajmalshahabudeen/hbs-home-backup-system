"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function PasskeyPage() {
  const [msg, setMsg] = useState("Preparing passkey…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setMsg("Touch your security key or use Windows Hello / Face ID…");
        const result = await authClient.signIn.passkey();
        if (cancelled) return;
        if (result.error) {
          setMsg(result.error.message || "Passkey sign-in failed");
          return;
        }
        window.location.replace("/auth/flutter-bridge");
      } catch (e) {
        if (!cancelled) setMsg(e instanceof Error ? e.message : "Passkey failed");
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
        <h1>HBS Cloud passkey</h1>
        <p>{msg}</p>
      </div>
    </main>
  );
}
