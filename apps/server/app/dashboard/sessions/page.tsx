"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Trash2, ShieldOff } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { relativeTime } from "@/lib/format";

type SessionRow = {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string | null;
  };
  ipAddress: string | null;
  deviceName: string;
  browser: string;
  os: string;
  deviceType: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  active: boolean;
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sessions?active=1&limit=300");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSessions(data.sessions || []);
      setTotalActive(data.totalActive || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function revoke(id: string) {
    if (!confirm("Revoke this session? The device will be signed out.")) return;
    const res = await fetch(
      `/api/admin/sessions?id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Revoke failed");
      return;
    }
    await load();
  }

  async function revokeOthers() {
    if (
      !confirm(
        "Revoke ALL other sessions? Your current session stays signed in."
      )
    )
      return;
    const res = await fetch("/api/admin/sessions?all=1", { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Revoke failed");
      return;
    }
    await load();
  }

  const columns = useMemo<DataTableColumn<SessionRow>[]>(
    () => [
      {
        id: "device",
        header: "Device",
        sortKey: "device",
        searchValue: (r) =>
          `${r.deviceName} ${r.browser} ${r.os} ${r.deviceType}`,
        cell: (r) => (
          <div>
            <div className="font-medium">{r.deviceName}</div>
            <div className="text-xs text-muted-foreground">
              {r.browser} · {r.os}
            </div>
          </div>
        ),
      },
      {
        id: "user",
        header: "User",
        sortKey: "user",
        searchValue: (r) => `${r.user.name} ${r.user.email} ${r.user.role}`,
        cell: (r) => (
          <div>
            <div className="font-medium">{r.user.name}</div>
            <div className="text-xs text-muted-foreground">{r.user.email}</div>
          </div>
        ),
      },
      {
        id: "ip",
        header: "IP",
        sortKey: "ip",
        searchValue: (r) => r.ipAddress || "",
        className: "font-mono text-xs",
        cell: (r) => r.ipAddress || "—",
      },
      {
        id: "type",
        header: "Type",
        sortKey: "type",
        searchValue: (r) => r.deviceType,
        cell: (r) => (
          <Badge variant="secondary" className="capitalize">
            {r.deviceType}
          </Badge>
        ),
      },
      {
        id: "role",
        header: "Role",
        sortKey: "role",
        searchValue: (r) => r.user.role || "user",
        cell: (r) => (
          <Badge variant={r.user.role === "admin" ? "default" : "outline"}>
            {r.user.role || "user"}
          </Badge>
        ),
      },
      {
        id: "seen",
        header: "Last seen",
        sortKey: "seen",
        searchValue: (r) => r.updatedAt,
        className: "text-xs text-muted-foreground whitespace-nowrap",
        cell: (r) => relativeTime(r.updatedAt),
      },
      {
        id: "expires",
        header: "Expires",
        sortKey: "expires",
        searchValue: (r) => r.expiresAt,
        className: "text-xs text-muted-foreground whitespace-nowrap",
        cell: (r) => new Date(r.expiresAt).toLocaleString(),
      },
      {
        id: "actions",
        header: "",
        headerClassName: "text-end",
        className: "text-end",
        cell: (r) => (
          <Button
            size="icon-sm"
            variant="ghost"
            title="Revoke session"
            onClick={() => revoke(r.id)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Active logins — IP, device name, browser, and OS.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={revokeOthers}>
            <ShieldOff className="size-4" />
            Revoke others
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active sessions</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{totalActive}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique users online</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {new Set(sessions.map((s) => s.userId)).size}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique IPs</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {
                new Set(
                  sessions.map((s) => s.ipAddress).filter(Boolean) as string[]
                ).size
              }
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected devices</CardTitle>
          <CardDescription>
            {loading ? "Loading…" : `${sessions.length} session(s) loaded`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={sessions}
            columns={columns}
            rowKey={(r) => r.id}
            searchPlaceholder="Search device, user, IP…"
            empty="No active sessions"
            defaultPageSize={25}
          />
        </CardContent>
      </Card>
    </div>
  );
}
