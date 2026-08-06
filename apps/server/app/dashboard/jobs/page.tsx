"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
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
import { Progress } from "@workspace/ui/components/progress";

type Job = {
  id: string;
  type: string;
  status: string;
  stage: string | null;
  stageLabel: string | null;
  progress: number;
  error: string | null;
  celeryTaskId: string | null;
  createdAt: string;
  user?: { email: string; name: string } | null;
};

type UserOpt = { id: string; email: string; name: string };

const JOB_TYPE_ITEMS: Record<string, string> = {
  SCAN: "SCAN user files",
  CONSISTENCY: "CONSISTENCY check",
  CHECKSUM: "CHECKSUM (parallel)",
  WARM_STATS: "WARM_STATS cache",
  REQUEUE_STALE: "REQUEUE_STALE",
  CRON_CONSISTENCY_ALL: "CRON_CONSISTENCY_ALL",
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [userId, setUserId] = useState("");
  const [type, setType] = useState("SCAN");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [jRes, uRes] = await Promise.all([
        fetch("/api/admin/jobs?limit=100"),
        fetch("/api/admin/users"),
      ]);
      const jData = await jRes.json();
      const uData = await uRes.json();
      if (!jRes.ok) throw new Error(jData.error || "jobs failed");
      if (!uRes.ok) throw new Error(uData.error || "users failed");
      setJobs(jData.jobs || []);
      setUsers(
        (uData.users || []).map((u: UserOpt & { id: string }) => ({
          id: u.id,
          email: u.email,
          name: u.name,
        }))
      );
      if (!userId && uData.users?.[0]?.id) setUserId(uData.users[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }, [userId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function enqueue() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          userId: ["SCAN", "CONSISTENCY", "CHECKSUM"].includes(type)
            ? userId
            : undefined,
          fix: true,
          workers: 4,
          limit: 500,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail?.error || "enqueue failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const userItems = Object.fromEntries(
    users.map((u) => [u.id, `${u.name} · ${u.email}`])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Redis + Celery background workers — scan, consistency, parallel
            checksums, cron.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Enqueue</CardTitle>
          <CardDescription>
            SCAN indexes disk → DB. CONSISTENCY heals DB/disk drift. CHECKSUM
            hashes files in parallel. Cron tasks run via Celery beat.
          </CardDescription>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Type</div>
              <Select
                value={type}
                onValueChange={(v) => v && setType(v)}
                items={JOB_TYPE_ITEMS}
              >
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(JOB_TYPE_ITEMS).map(([value, label]) => (
                    <SelectItem key={value} value={value} label={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {["SCAN", "CONSISTENCY", "CHECKSUM"].includes(type) && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">User</div>
                <Select
                  value={userId || undefined}
                  onValueChange={(v) => v && setUserId(v)}
                  items={userItems}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem
                        key={u.id}
                        value={u.id}
                        label={`${u.name} · ${u.email}`}
                      >
                        {u.name} · {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={enqueue} disabled={loading}>
              <Play className="size-4" />
              {loading ? "Enqueueing…" : "Run"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell>
                    <div className="font-medium">{j.type}</div>
                    <div className="max-w-[14rem] truncate font-mono text-[10px] text-muted-foreground">
                      {j.id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        j.status === "FAILED"
                          ? "destructive"
                          : j.status === "COMPLETED"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {j.status}
                    </Badge>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {j.stageLabel || j.stage || "—"}
                    </div>
                    {j.error && (
                      <div className="mt-1 max-w-xs truncate text-xs text-destructive">
                        {j.error}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="w-40">
                    <Progress value={j.progress} className="h-2" />
                    <div className="mt-1 text-xs text-muted-foreground">
                      {j.progress}%
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {j.user?.email || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(j.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No jobs yet
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
