"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2, Ban } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
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

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: string;
  _count: { backupFiles: number; sessions: number };
};

const roleItems = {
  user: "User",
  admin: "Admin",
} as const;

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Create failed");
      return;
    }
    setOpen(false);
    setForm({ name: "", email: "", password: "", role: "user" });
    await load();
  }

  async function setRole(id: string, role: string) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Update failed");
      return;
    }
    await load();
  }

  async function toggleBan(u: UserRow) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: u.id,
        banned: !u.banned,
        banReason: !u.banned ? "Banned by admin" : null,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Update failed");
      return;
    }
    await load();
  }

  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function remove(id: string) {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Delete failed");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteLoading(false);
      setUserToDelete(null);
    }
  }

  const columns = useMemo<DataTableColumn<UserRow>[]>(
    () => [
      {
        id: "user",
        header: "User",
        sortKey: "user",
        searchValue: (u) => `${u.name} ${u.email}`,
        cell: (u) => (
          <div>
            <div className="font-medium">{u.name}</div>
            <div className="text-xs text-muted-foreground">{u.email}</div>
          </div>
        ),
      },
      {
        id: "role",
        header: "Role",
        sortKey: "role",
        searchValue: (u) => u.role || "user",
        cell: (u) => (
          <Select
            value={u.role || "user"}
            onValueChange={(v) => v && setRole(u.id, v)}
            items={roleItems}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        ),
      },
      {
        id: "files",
        header: "Files",
        sortKey: "files",
        searchValue: (u) => String(u._count.backupFiles),
        className: "tabular-nums",
        cell: (u) => u._count.backupFiles,
      },
      {
        id: "sessions",
        header: "Sessions",
        sortKey: "sessions",
        searchValue: (u) => String(u._count.sessions),
        className: "tabular-nums",
        cell: (u) => u._count.sessions,
      },
      {
        id: "status",
        header: "Status",
        sortKey: "status",
        searchValue: (u) => (u.banned ? "banned" : "active"),
        cell: (u) =>
          u.banned ? (
            <Badge variant="destructive">banned</Badge>
          ) : (
            <Badge variant="secondary">active</Badge>
          ),
      },
      {
        id: "created",
        header: "Created",
        sortKey: "created",
        searchValue: (u) => u.createdAt,
        className: "text-xs text-muted-foreground whitespace-nowrap",
        cell: (u) => new Date(u.createdAt).toLocaleDateString(),
      },
      {
        id: "actions",
        header: "",
        headerClassName: "text-end",
        className: "text-end",
        cell: (u) => (
          <div className="flex justify-end gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              title={u.banned ? "Unban" : "Ban"}
              onClick={() => toggleBan(u)}
            >
              <Ban className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setUserToDelete(u)}
              title="Delete user"
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Create, promote, ban, or delete accounts. First user is always admin.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add user
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All accounts</CardTitle>
          <CardDescription>
            {loading ? "Loading…" : `${users.length} user(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={users}
            columns={columns}
            rowKey={(u) => u.id}
            searchPlaceholder="Search name or email…"
            empty="No users found"
            defaultPageSize={25}
          />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={createUser}>
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
              <DialogDescription>
                Password min 8 characters. Role can be admin or user.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="n">Name</Label>
                <Input
                  id="n"
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e">Email</Label>
                <Input
                  id="e"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p">Password</Label>
                <Input
                  id="p"
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) =>
                    v && setForm((f) => ({ ...f, role: v }))
                  }
                  items={roleItems}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={Boolean(userToDelete)}
        onOpenChange={(open) => {
          if (!open) setUserToDelete(null);
        }}
        title="Delete User Account"
        description={
          userToDelete ? (
            <span>
              Are you sure you want to delete account <strong className="font-semibold text-foreground">{userToDelete.name} ({userToDelete.email})</strong> and all related sessions? This action cannot be undone.
            </span>
          ) : null
        }
        loading={deleteLoading}
        onConfirm={async () => {
          if (userToDelete) {
            await remove(userToDelete.id);
          }
        }}
      />
    </div>
  );
}
