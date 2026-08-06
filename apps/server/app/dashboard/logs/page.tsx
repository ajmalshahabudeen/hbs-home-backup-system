"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Badge } from "@workspace/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";

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

export default function LogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (q) params.set("q", q);
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
  }, [q, type, level]);

  useEffect(() => {
    load();
  }, [load]);

  async function clearAll() {
    if (!confirm("Delete ALL logs?")) return;
    const res = await fetch("/api/admin/logs?all=1", { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed");
      return;
    }
    await load();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System logs</h1>
          <p className="text-sm text-muted-foreground">
            Full audit trail — auth, user CRUD, and file operations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={clearAll}>
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
            <Input
              placeholder="Search message / email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-xs"
            />
            <Select value={type} onValueChange={(v) => v && setType(v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="LOGIN">LOGIN</SelectItem>
                <SelectItem value="REGISTER">REGISTER</SelectItem>
                <SelectItem value="USER_CRUD">USER_CRUD</SelectItem>
                <SelectItem value="FILE_CRUD">FILE_CRUD</SelectItem>
                <SelectItem value="SYSTEM">SYSTEM</SelectItem>
              </SelectContent>
            </Select>
            <Select value={level} onValueChange={(v) => v && setLevel(v)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="INFO">INFO</SelectItem>
                <SelectItem value="WARN">WARN</SelectItem>
                <SelectItem value="ERROR">ERROR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-end"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(l.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        l.level === "ERROR"
                          ? "destructive"
                          : l.level === "WARN"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {l.level}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{l.type}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm">
                    {l.message}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.userEmail || "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => remove(l.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && logs.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    No logs
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
