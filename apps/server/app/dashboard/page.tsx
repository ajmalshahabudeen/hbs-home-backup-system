"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Files,
  ScrollText,
  HardDrive,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";

type StatsResponse = {
  stats: {
    users: number;
    admins: number;
    files: number;
    logs: number;
    totalBytes: number;
  };
  storage: { ok: boolean; root: string; error?: string };
  recentLogs: Array<{
    id: string;
    timestamp: string;
    level: string;
    type: string;
    message: string;
    status: string;
  }>;
  recentUsers: Array<{
    id: string;
    name: string;
    email: string;
    role: string | null;
    createdAt: string;
  }>;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(1)} ${u[i]}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || r.statusText);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Users",
      value: data.stats.users,
      sub: `${data.stats.admins} admin`,
      icon: Users,
      href: "/dashboard/users",
    },
    {
      label: "Files",
      value: data.stats.files,
      sub: formatBytes(data.stats.totalBytes),
      icon: Files,
      href: "/dashboard/files",
    },
    {
      label: "Logs",
      value: data.stats.logs,
      sub: "audit trail",
      icon: ScrollText,
      href: "/dashboard/logs",
    },
    {
      label: "Storage",
      value: data.storage.ok ? "Ready" : "Error",
      sub: data.storage.root,
      icon: HardDrive,
      href: "/dashboard/files",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Home backup control plane — users, drive files, and full logs.
        </p>
      </div>

      {!data.storage.ok && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <div className="font-medium">Storage not writable</div>
            <div className="text-muted-foreground">
              {data.storage.error || "Check HOST_STORAGE_PATH / STORAGE_ROOT"}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href}>
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription>{c.label}</CardDescription>
                  <Icon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{c.value}</div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {c.sub}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent users</CardTitle>
            <CardDescription>Latest accounts in the system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentUsers.length === 0 && (
              <p className="text-sm text-muted-foreground">No users yet.</p>
            )}
            {data.recentUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{u.name}</div>
                  <div className="truncate text-muted-foreground">{u.email}</div>
                </div>
                <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                  {u.role || "user"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent logs</CardTitle>
            <CardDescription>Latest auth and admin activity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentLogs.length === 0 && (
              <p className="text-sm text-muted-foreground">No logs yet.</p>
            )}
            {data.recentLogs.map((l) => (
              <div key={l.id} className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      l.level === "ERROR"
                        ? "destructive"
                        : l.level === "WARN"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {l.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(l.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-muted-foreground">{l.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
