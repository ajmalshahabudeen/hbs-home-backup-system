"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Folder,
  FileIcon,
  FolderPlus,
  Trash2,
  Download,
  ChevronRight,
  RefreshCw,
  Home,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";

type UserOpt = {
  id: string;
  name: string;
  email: string;
  _count: { backupFiles: number };
};

type FileRow = {
  id: string;
  name: string;
  path: string;
  parentPath: string;
  isDir: boolean;
  size: number;
  mimeType: string | null;
  updatedAt: string;
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

export default function FilesPage() {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [path, setPath] = useState("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [storageRoot, setStorageRoot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [loading, setLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/files");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    setUsers(data.users || []);
    setStorageRoot(data.storageRoot || "");
    if (!userId && data.users?.[0]?.id) setUserId(data.users[0].id);
  }, [userId]);

  const loadFiles = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/files?userId=${encodeURIComponent(userId)}&path=${encodeURIComponent(path)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to list files");
      setFiles(data.files || []);
      if (data.storageRoot) setStorageRoot(data.storageRoot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [userId, path]);

  useEffect(() => {
    loadUsers().catch((e) => setError(e.message));
  }, [loadUsers]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!folderName.trim() || !userId) return;
    const res = await fetch("/api/admin/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        path,
        name: folderName.trim(),
        isDir: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Create failed");
      return;
    }
    setFolderName("");
    await loadFiles();
  }

  async function onUpload(fileList: FileList | null) {
    if (!fileList?.length || !userId) return;
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.set("userId", userId);
      fd.set("path", path);
      fd.set("file", file);
      const res = await fetch("/api/admin/files", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Upload failed: ${file.name}`);
        return;
      }
    }
    await loadFiles();
  }

  async function remove(id: string) {
    if (!confirm("Delete this item?")) return;
    const res = await fetch(`/api/admin/files?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    await loadFiles();
  }

  function openDir(name: string) {
    setPath(path ? `${path}/${name}` : name);
  }

  function goUp() {
    if (!path) return;
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    setPath(parts.join("/"));
  }

  const crumbs = path ? path.split("/").filter(Boolean) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
          <p className="text-sm text-muted-foreground">
            CRUD every user&apos;s backup tree on the mounted hard drive.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadFiles}>
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
          <CardTitle>Browser</CardTitle>
          <CardDescription className="truncate font-mono text-xs">
            Storage root: {storageRoot || "…"}
          </CardDescription>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>User</Label>
              <Select
                value={userId}
                onValueChange={(v) => {
                  if (v) {
                    setUserId(v);
                    setPath("");
                  }
                }}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <form onSubmit={createFolder} className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="folder">New folder</Label>
                <Input
                  id="folder"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Photos"
                  className="w-40"
                />
              </div>
              <Button type="submit" variant="outline">
                <FolderPlus className="size-4" />
                Create
              </Button>
            </form>
            <div className="space-y-1.5">
              <Label htmlFor="up">Upload</Label>
              <Input
                id="up"
                type="file"
                multiple
                onChange={(e) => onUpload(e.target.files)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setPath("")}
              title="Root"
            >
              <Home className="size-3.5" />
            </Button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="size-3.5" />
                <button
                  type="button"
                  className="hover:text-foreground hover:underline"
                  onClick={() =>
                    setPath(crumbs.slice(0, i + 1).join("/"))
                  }
                >
                  {c}
                </button>
              </span>
            ))}
            {path && (
              <Button size="sm" variant="ghost" className="ms-2" onClick={goUp}>
                Up
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="flex items-center gap-2 text-start hover:underline"
                      onClick={() => (f.isDir ? openDir(f.name) : undefined)}
                      disabled={!f.isDir}
                    >
                      {f.isDir ? (
                        <Folder className="size-4 text-primary" />
                      ) : (
                        <FileIcon className="size-4 text-muted-foreground" />
                      )}
                      {f.name}
                    </button>
                  </TableCell>
                  <TableCell>
                    {f.isDir ? "—" : formatBytes(f.size)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(f.updatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      {!f.isDir && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          render={
                            <a
                              href={`/api/admin/files?download=1&id=${encodeURIComponent(f.id)}`}
                            />
                          }
                        >
                          <Download className="size-4" />
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => remove(f.id)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && files.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    Empty folder — upload files or create a directory
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
