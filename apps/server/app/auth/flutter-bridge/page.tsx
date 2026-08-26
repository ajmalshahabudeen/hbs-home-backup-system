import { auth } from "@workspace/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FlutterBridgePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const token = session?.session?.token as string | undefined;
  if (!token) {
    return (
      <html lang="en">
        <body
          style={{
            fontFamily: "system-ui, sans-serif",
            background: "#F2EDE5",
            color: "#3F2A1D",
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 24,
          }}
        >
          <div>
            <h1>Google sign-in did not finish</h1>
            <p>Return to HBS Cloud and try again. Make sure GOOGLE_CLIENT_ID is set on the server.</p>
          </div>
        </body>
      </html>
    );
  }
  redirect(`hbscloud://auth?token=${encodeURIComponent(token)}`);
}
