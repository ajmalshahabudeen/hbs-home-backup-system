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
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
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

  // Dialog state
  const [sessionToRevoke, setSessionToRevoke] = useState<SessionRow | null>(null);
  const [revokeOthersOpen, setRevokeOthersOpen] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);

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

  async function handleRevokeSession(id: string) {
    setRevokeLoading(true);
    try {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setRevokeLoading(false);
      setSessionToRevoke(null);
    }
  }

  async function handleRevokeOthers() {
    setRevokeLoading(true);
    try {
      const res = await fetch("/api/admin/sessions?all=1", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Revoke failed");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setRevokeLoading(false);
      setRevokeOthersOpen(false);
    }
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
        className: "font-mono text-xs text-muted-foreground",
        cell: (r) => r.ipAddress || "—",
      },
      {
        id: "lastActive",
        header: "Last active",
        sortKey: "lastActive",
        searchValue: (r) => r.updatedAt,
        className: "whitespace-nowrap text-xs text-muted-foreground",
        cell: (r) => relativeTime(r.updatedAt),
      },
      {
        id: "created",
        header: "Created",
        sortKey: "created",
        searchValue: (r) => r.createdAt,
        className: "whitespace-nowrap text-xs text-muted-foreground",
        cell: (r) => new Date(r.createdAt).toLocaleString(),
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
            onClick={() => setSessionToRevoke(r)}
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
          <h1 className="text-2xl font-semibold tracking-tight">Active Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Monitor active device tokens and revoke suspicious sessions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setRevokeOthersOpen(true)}>
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

      {/* Revoke Single Session Dialog */}
      <DeleteConfirmDialog
        open={Boolean(sessionToRevoke)}
        onOpenChange={(open) => {
          if (!open) setSessionToRevoke(null);
        }}
        title="Revoke Session"
        description={
          sessionToRevoke ? (
            <span>
              Are you sure you want to revoke session for device <strong className="font-semibold text-foreground">{sessionToRevoke.deviceName} ({sessionToRevoke.user.email})</strong>? The device will be immediately signed out.
            </span>
          ) : null
        }
        confirmText="Revoke Session"
        loading={revokeLoading}
        onConfirm={async () => {
          if (sessionToRevoke) {
            await handleRevokeSession(sessionToRevoke.id);
          }
        }}
      />

      {/* Revoke All Other Sessions Dialog */}
      <DeleteConfirmDialog
        open={revokeOthersOpen}
        onOpenChange={setRevokeOthersOpen}
        title="Revoke All Other Sessions"
        description="Are you sure you want to revoke ALL other active sessions across all devices? Your current session will remain active, but all other devices will be signed out."
        confirmText="Revoke All Others"
        loading={revokeLoading}
        onConfirm={handleRevokeOthers}
      />
    </div>
  );
}
