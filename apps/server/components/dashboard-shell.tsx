"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  HardDrive,
  LayoutDashboard,
  Users,
  FolderOpen,
  ScrollText,
  LogOut,
  Cog,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { authClient } from "@/lib/auth-client";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/users", label: "Users", icon: Users },
  { href: "/dashboard/files", label: "Files", icon: FolderOpen },
  { href: "/dashboard/jobs", label: "Jobs", icon: Cog },
  { href: "/dashboard/logs", label: "Logs", icon: ScrollText },
];

export function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: { name?: string | null; email?: string | null };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 flex h-svh w-60 shrink-0 flex-col border-e bg-card/40 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-5 font-semibold tracking-tight">
          <HardDrive className="size-5 text-primary" />
          HBS Admin
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/15 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t p-3">
          <div className="truncate px-2 text-xs text-muted-foreground">
            <div className="truncate font-medium text-foreground">
              {user?.name || "Admin"}
            </div>
            <div className="truncate">{user?.email}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={logout}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
