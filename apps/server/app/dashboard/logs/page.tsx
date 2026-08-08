"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

type LogRow = {
  id: string;
  timestamp: string;
  level: string;
  type: string;
  message: string;
  status: string;
  userEmail: string | null;
  ipAddress: string | null;
};

const typeItems = {
  all: "All types",
  LOGIN: "LOGIN",
  REGISTER: "REGISTER",
  USER_CRUD: "USER_CRUD",
  FILE_CRUD: "FILE_CRUD",
  SESSION: "SESSION",
  SYSTEM: "SYSTEM",
} as const;

const levelItems = {
  all: "All levels",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
} as const;

export default function LogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (type !== "all") params.set("type", type);
      if (level !== "all") params.set("level", level);
      const res = await fetch(`/api/admin/logs?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setLogs(data.logs);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [type, level]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClearAll() {
    setClearLoading(true);
    try {
      const res = await fetch("/api/admin/logs?all=1", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to clear logs");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear logs");
    } finally {
      setClearLoading(false);
      setClearAllOpen(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/logs?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed");
      return;
    }
    await load();
  }

  const columns = useMemo<DataTableColumn<LogRow>[]>(
    () => [
      {
        id: "time",
        header: "Time",
        sortKey: "time",
        searchValue: (l) => l.timestamp,
        className: "whitespace-nowrap font-mono text-xs text-muted-foreground",
        cell: (l) => new Date(l.timestamp).toLocaleString(),
      },
      {
        id: "level",
        header: "Level",
        sortKey: "level",
        searchValue: (l) => l.level,
        cell: (l) => (
          <Badge
            variant={
              l.level === "ERROR"
                ? "destructive"
                : l.level === "WARN"
                  ? "outline"
                  : "secondary"
            }
            className="font-mono text-[10px]"
          >
            {l.level}
          </Badge>
        ),
      },
      {
        id: "type",
        header: "Type",
        sortKey: "type",
        searchValue: (l) => l.type,
        cell: (l) => <Badge variant="outline" className="text-xs">{l.type}</Badge>,
      },
      {
        id: "message",
        header: "Message",
        sortKey: "message",
        searchValue: (l) => l.message,
        cell: (l) => <span className="font-mono text-xs">{l.message}</span>,
      },
      {
        id: "user",
        header: "User",
        sortKey: "user",
        searchValue: (l) => l.userEmail || "",
        className: "text-xs text-muted-foreground",
        cell: (l) => l.userEmail || "—",
      },
      {
        id: "ip",
        header: "IP",
        sortKey: "ip",
        searchValue: (l) => l.ipAddress || "",
        className: "font-mono text-xs text-muted-foreground",
        cell: (l) => l.ipAddress || "—",
      },
      {
        id: "actions",
        header: "",
        headerClassName: "text-end",
        className: "text-end",
        cell: (l) => (
          <Button
            size="icon-sm"
            variant="ghost"
            title="Delete log"
            onClick={() => remove(l.id)}
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
          <h1 className="text-2xl font-semibold tracking-tight">System logs</h1>
          <p className="text-sm text-muted-foreground">
            Full audit trail — auth, sessions, user CRUD, and file operations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setClearAllOpen(true)}>
            Clear all
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Events</CardTitle>
          <CardDescription>
            {loading ? "Loading…" : `${total} total · showing ${logs.length}`}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Select
              value={type}
              onValueChange={(v) => v && setType(v)}
              items={typeItems}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(typeItems).map(([value, label]) => (
                  <SelectItem key={value} value={value} label={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={level}
              onValueChange={(v) => v && setLevel(v)}
              items={levelItems}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(levelItems).map(([value, label]) => (
                  <SelectItem key={value} value={value} label={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={logs}
            columns={columns}
            rowKey={(l) => l.id}
            searchPlaceholder="Search message / email / IP…"
            empty="No logs"
            defaultPageSize={25}
          />
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={clearAllOpen}
        onOpenChange={setClearAllOpen}
        title="Clear All System Logs"
        description="Are you sure you want to permanently delete ALL system audit logs? This action cannot be undone."
        confirmText="Clear All Logs"
        loading={clearLoading}
        onConfirm={handleClearAll}
      />
    </div>
  );
}
