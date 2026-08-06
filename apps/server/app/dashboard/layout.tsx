import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@workspace/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const role = (session.user as { role?: string | null }).role;
  if (role !== "admin") redirect("/login?error=admin_only");

  return (
    <DashboardShell user={session.user}>{children}</DashboardShell>
  );
}
