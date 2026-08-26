"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Files,
  ScrollText,
  HardDrive,
  AlertTriangle,
  MonitorSmartphone,
  Activity,
  CheckCircle2,
  XCircle,
  FolderTree,
  Cog,
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
import { Progress } from "@workspace/ui/components/progress";
import { Button } from "@workspace/ui/components/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { formatBytes, relativeTime } from "@/lib/format";

type StatsResponse = {
  stats: {
    users: number;
    admins: number;
    files: number;
    directories: number;
    logs: number;
    logsLast24h: number;
    totalBytes: number;
    activeSessions: number;
    jobs: { pending: number; running: number; failed: number };
  };
  storage: {
    ok: boolean;
    writable: boolean;
    exists: boolean;
    root: string;
    hostPath: string;
    containerPath: string;
    driveLetter: string | null;
    name: string;
    platform: string;
    hostname: string;
    error?: string;
    checkedAt: string;
    disk: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
      available: boolean;
      error?: string;
    };
  };
  charts: {
    activity: Array<{
      date: string;
      total: number;
      error: number;
      login: number;
    }>;
    storageByUser: Array<{
      userId: string;
      name: string;
      email: string;
      files: number;
      bytes: number;
    }>;
    jobsByStatus: Array<{ status: string; count: number }>;
  };
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
  sessions: Array<{
    id: string;
    user: { id: string; name: string; email: string; role: string | null };
    ipAddress: string | null;
    deviceName: string;
    browser: string;
    os: string;
    deviceType: string;
    updatedAt: string;
    expiresAt: string;
  }>;
};

const activityConfig = {
  total: { label: "Events", color: "var(--chart-1)" },
  login: { label: "Logins", color: "var(--chart-2)" },
  error: { label: "Errors", color: "var(--chart-5)" },
} satisfies ChartConfig;

const storageConfig = {
  bytes: { label: "Storage", color: "var(--chart-3)" },
} satisfies ChartConfig;

const jobColors: Record<string, string> = {
  PENDING: "var(--chart-4)",
  RUNNING: "var(--chart-2)",
  COMPLETED: "var(--chart-1)",
  FAILED: "var(--chart-5)",
  CANCELLED: "var(--muted-foreground)",
};

export default function DashboardPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/admin/stats");
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.statusText);
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
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
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const { storage, stats, charts } = data;
  const disk = storage.disk;
  const cards = [
    {
      label: "Users",
      value: stats.users,
      sub: `${stats.admins} admin`,
      icon: Users,
      href: "/dashboard/users",
    },
    {
      label: "Files",
      value: stats.files,
      sub: `${formatBytes(stats.totalBytes)} · ${stats.directories} folders`,
      icon: Files,
      href: "/dashboard/files",
    },
    {
      label: "Sessions",
      value: stats.activeSessions,
      sub: "active devices",
      icon: MonitorSmartphone,
      href: "/dashboard/sessions",
    },
    {
      label: "Jobs",
      value: stats.jobs.running + stats.jobs.pending,
      sub: `${stats.jobs.failed} failed · ${stats.logsLast24h} logs/24h`,
      icon: Cog,
      href: "/dashboard/jobs",
    },
  ];

  const pieData = charts.jobsByStatus.map((j) => ({
    name: j.status,
    value: j.count,
    fill: jobColors[j.status] || "var(--chart-1)",
  }));

  const barData = charts.storageByUser.map((u) => ({
    name: u.name.split(" ")[0] || u.email.split("@")[0] || "user",
    bytes: u.bytes,
    gb: Math.round((u.bytes / (1024 ** 3)) * 100) / 100,
    files: u.files,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Storage health, sessions, and system activity.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/dashboard/logs" />}>
          <ScrollText className="size-4" />
          View logs
        </Button>
      </div>

      {/* Storage drive panel */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b bg-muted/30">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <HardDrive className="size-5" />
            </div>
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {storage.name}
                {storage.driveLetter && (
                  <Badge variant="outline">{storage.driveLetter}</Badge>
                )}
                {storage.writable ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="size-3" />
                    Healthy
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="size-3" />
                    Error
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Backup volume · checked {relativeTime(storage.checkedAt)}
              </CardDescription>
            </div>
          </div>
          <div className="text-end text-xs text-muted-foreground">
            <div>Host: {storage.hostname}</div>
            <div className="capitalize">{storage.platform}</div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 pt-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-1">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Host path
              </div>
              <code className="block truncate rounded-xl bg-muted px-3 py-2 font-mono text-xs">
                {storage.hostPath}
              </code>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Container mount
              </div>
              <code className="block truncate rounded-xl bg-muted px-3 py-2 font-mono text-xs">
                {storage.containerPath}
              </code>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={storage.exists ? "secondary" : "destructive"}>
                {storage.exists ? "Path exists" : "Missing path"}
              </Badge>
              <Badge variant={storage.writable ? "secondary" : "destructive"}>
                {storage.writable ? "Writable" : "Not writable"}
              </Badge>
              <Badge variant={disk.available ? "secondary" : "outline"}>
                {disk.available ? "Disk metrics OK" : "Disk metrics N/A"}
              </Badge>
            </div>
            {(storage.error || disk.error) && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                <span>{storage.error || disk.error}</span>
              </div>
            )}
          </div>

          <div className="space-y-4 lg:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-sm text-muted-foreground">Disk usage</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {disk.available
                    ? `${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}`
                    : "—"}
                </div>
              </div>
              <div className="text-end">
                <div className="text-2xl font-semibold tabular-nums">
                  {disk.available ? `${disk.usedPercent}%` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {disk.available
                    ? `${formatBytes(disk.freeBytes)} free`
                    : "unavailable"}
                </div>
              </div>
            </div>
            <Progress
              value={disk.available ? Math.min(100, disk.usedPercent) : 0}
              className="h-3"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric
                label="Indexed files"
                value={String(stats.files)}
                icon={Files}
              />
              <Metric
                label="Folders"
                value={String(stats.directories)}
                icon={FolderTree}
              />
              <Metric
                label="DB bytes"
                value={formatBytes(stats.totalBytes)}
                icon={HardDrive}
              />
              <Metric
                label="Active sessions"
                value={String(stats.activeSessions)}
                icon={MonitorSmartphone}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <div className="text-2xl font-semibold tabular-nums">
                    {c.value}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {c.sub}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" />
              Activity (7 days)
            </CardTitle>
            <CardDescription>Logs, logins, and errors</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={activityConfig} className="aspect-[16/7] w-full">
              <AreaChart data={charts.activity} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => String(v).slice(5)}
                />
                <YAxis tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--color-total)"
                  fill="var(--color-total)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="login"
                  stroke="var(--color-login)"
                  fill="var(--color-login)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="error"
                  stroke="var(--color-error)"
                  fill="var(--color-error)"
                  fillOpacity={0.08}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Jobs by status</CardTitle>
            <CardDescription>Background worker queue</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {pieData.length === 0 ? (
              <p className="py-10 text-sm text-muted-foreground">No jobs yet</p>
            ) : (
              <ChartContainer
                config={{
                  value: { label: "Jobs" },
                }}
                className="mx-auto aspect-square w-full max-w-[220px]"
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {pieData.map((p) => (
                <Badge key={p.name} variant="outline" className="gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: p.fill }}
                  />
                  {p.name} · {p.value}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Storage by user</CardTitle>
            <CardDescription>Top accounts by indexed bytes</CardDescription>
          </CardHeader>
          <CardContent>
            {barData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No file index yet — run a SCAN job
              </p>
            ) : (
              <ChartContainer config={storageConfig} className="aspect-[16/9] w-full">
                <BarChart data={barData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(v) => formatBytes(Number(v))}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatBytes(Number(value))}
                      />
                    }
                  />
                  <Bar
                    dataKey="bytes"
                    fill="var(--color-bytes)"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active sessions</CardTitle>
              <CardDescription>Connected devices & IPs</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/dashboard/sessions" />}
            >
              All sessions
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No active sessions.</p>
            )}
            {data.sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between gap-3 rounded-xl border bg-card/40 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.deviceName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.user.name} · {s.user.email}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {s.ipAddress || "no-ip"}
                    </Badge>
                    <span>{s.os}</span>
                    <span>·</span>
                    <span>{relativeTime(s.updatedAt)}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 capitalize">
                  {s.deviceType}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pair a phone</CardTitle>
          <CardDescription>Scan this QR in HBS Cloud to set the server URL</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <img
            src="/api/pair/qr"
            alt="Pair HBS Cloud"
            width={160}
            height={160}
            className="rounded-xl border bg-white p-2"
          />
          <p className="max-w-sm text-sm text-muted-foreground">
            Open HBS Cloud → Scan QR. The phone will connect to this dashboard&apos;s LAN address.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent users</CardTitle>
            <CardDescription>Latest accounts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
