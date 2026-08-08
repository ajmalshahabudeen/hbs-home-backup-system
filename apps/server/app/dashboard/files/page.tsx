"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Folder,
  FileIcon,
  FolderPlus,
  Trash2,
  Download,
  ChevronRight,
  RefreshCw,
  Home,
  Eye,
  LayoutGrid,
  Table as TableIcon,
  RotateCcw,
  Film,
  Music,
  Image as ImageIcon,
  FileCode,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { useFilesStore } from "@/lib/stores/use-files-store";
import { FilePreviewModal, type FilePreviewRow } from "@/components/file-preview-modal";

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
  const {
    selectedUserId,
    currentPath,
    pageSize,
    viewMode,
    sortKey,
    sortDir,
    setSelectedUserId,
    setCurrentPath,
    setPageSize,
    setViewMode,
    setSort,
    resetPreferences,
  } = useFilesStore();

  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [storageRoot, setStorageRoot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [loading, setLoading] = useState(false);

  // File Preview state
  const [previewFile, setPreviewFile] = useState<FilePreviewRow | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/files");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setUsers(data.users || []);
      setStorageRoot(data.storageRoot || "");
      if (!selectedUserId && data.users?.[0]?.id) {
        setSelectedUserId(data.users[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }, [selectedUserId, setSelectedUserId]);

  const loadFiles = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/files?userId=${encodeURIComponent(selectedUserId)}&path=${encodeURIComponent(currentPath)}`
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
  }, [selectedUserId, currentPath]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (mounted && selectedUserId) {
      loadFiles();
    }
  }, [mounted, selectedUserId, currentPath, loadFiles]);

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!folderName.trim() || !selectedUserId) return;
    const res = await fetch("/api/admin/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: selectedUserId,
        path: currentPath,
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
    if (!fileList?.length || !selectedUserId) return;
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.set("userId", selectedUserId);
      fd.set("path", currentPath);
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
    setCurrentPath(currentPath ? `${currentPath}/${name}` : name);
  }

  function goUp() {
    if (!currentPath) return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
  }

  function handlePreview(file: FileRow) {
    setPreviewFile(file);
    setPreviewOpen(true);
  }

  const crumbs = currentPath ? currentPath.split("/").filter(Boolean) : [];

  const userItems = Object.fromEntries(
    users.map((u) => [u.id, `${u.name} · ${u.email}`])
  );

  const columns = useMemo<DataTableColumn<FileRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        sortKey: "name",
        searchValue: (f) => f.name,
        cell: (f) => (
          <button
            type="button"
            className="flex items-center gap-2.5 text-start hover:underline font-medium"
            onClick={() => (f.isDir ? openDir(f.name) : handlePreview(f))}
          >
            {f.isDir ? (
              <Folder className="size-4 text-amber-500 fill-amber-500/20" />
            ) : f.mimeType?.startsWith("image/") ? (
              <ImageIcon className="size-4 text-blue-500" />
            ) : f.mimeType?.startsWith("video/") ? (
              <Film className="size-4 text-purple-500" />
            ) : f.mimeType?.startsWith("audio/") ? (
              <Music className="size-4 text-emerald-500" />
            ) : f.mimeType?.startsWith("text/") || f.name.match(/\.(json|ts|tsx|js|jsx|py|sh|md|html|css)$/i) ? (
              <FileCode className="size-4 text-amber-600" />
            ) : (
              <FileIcon className="size-4 text-muted-foreground" />
            )}
            <span className="truncate max-w-xs">{f.name}</span>
          </button>
        ),
      },
      {
        id: "type",
        header: "Type",
        sortKey: "type",
        searchValue: (f) => (f.isDir ? "Folder" : f.mimeType || f.name.split(".").pop() || "File"),
        cell: (f) => (
          <Badge variant={f.isDir ? "secondary" : "outline"} className="text-[11px] font-mono">
            {f.isDir
              ? "Folder"
              : f.name.split(".").pop()?.toUpperCase() || f.mimeType?.split("/")[1] || "FILE"}
          </Badge>
        ),
      },
      {
        id: "size",
        header: "Size",
        sortKey: "size",
        searchValue: (f) => String(f.size),
        className: "font-mono text-xs text-muted-foreground",
        cell: (f) => (f.isDir ? "—" : formatBytes(f.size)),
      },
      {
        id: "updatedAt",
        header: "Updated",
        sortKey: "updatedAt",
        searchValue: (f) => f.updatedAt,
        className: "whitespace-nowrap text-xs text-muted-foreground",
        cell: (f) => new Date(f.updatedAt).toLocaleString(),
      },
      {
        id: "actions",
        header: "",
        headerClassName: "text-end",
        className: "text-end",
        cell: (f) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {!f.isDir && (
              <Button
                size="icon-sm"
                variant="ghost"
                title="Preview file"
                onClick={() => handlePreview(f)}
              >
                <Eye className="size-4 text-blue-500" />
              </Button>
            )}
            {!f.isDir && (
              <Button
                size="icon-sm"
                variant="ghost"
                title="Download file"
                render={
                  <a
                    href={`/api/admin/files?download=1&id=${encodeURIComponent(f.id)}`}
                    download={f.name}
                  />
                }
              >
                <Download className="size-4" />
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              title="Delete item"
              onClick={async () => {
                if (!confirm(`Delete ${f.name}?`)) return;
                await remove(f.id);
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [openDir]
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
          <p className="text-sm text-muted-foreground">
            Manage, search, preview, and CRUD user backup files on hard drive.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadFiles}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetPreferences}
            title="Reset dropdown & table preferences"
          >
            <RotateCcw className="size-3.5" />
            Reset prefs
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Card */}
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Browser</CardTitle>
              <CardDescription className="truncate font-mono text-xs mt-1">
                Storage root: {storageRoot || "…"}
              </CardDescription>
            </div>
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 rounded-lg border p-1 bg-muted/30">
              <Button
                size="xs"
                variant={viewMode === "table" ? "secondary" : "ghost"}
                onClick={() => setViewMode("table")}
                title="Table View"
              >
                <TableIcon className="size-3.5" /> Table
              </Button>
              <Button
                size="xs"
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                onClick={() => setViewMode("grid")}
                title="Grid View"
              >
                <LayoutGrid className="size-3.5" /> Grid
              </Button>
            </div>
          </div>

          {/* Form controls */}
          <div className="flex flex-wrap items-end gap-3 border-y py-3">
            <div className="space-y-1.5">
              <Label>User</Label>
              <Select
                value={selectedUserId || undefined}
                onValueChange={(v) => {
                  if (v) {
                    setSelectedUserId(v);
                    setCurrentPath("");
                  }
                }}
                items={userItems}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id} label={`${u.name} · ${u.email}`}>
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
                  className="w-36"
                />
              </div>
              <Button type="submit" variant="outline">
                <FolderPlus className="size-4" />
                Create
              </Button>
            </form>

            <div className="space-y-1.5">
              <Label htmlFor="up">Upload files</Label>
              <Input
                id="up"
                type="file"
                multiple
                onChange={(e) => onUpload(e.target.files)}
                className="w-56 cursor-pointer"
              />
            </div>
          </div>

          {/* Breadcrumb Navigation */}
          <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground pt-1">
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setCurrentPath("")}
              title="Root directory"
            >
              <Home className="size-3.5" />
            </Button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="size-3.5" />
                <button
                  type="button"
                  className="hover:text-foreground hover:underline font-medium text-foreground/80"
                  onClick={() => setCurrentPath(crumbs.slice(0, i + 1).join("/"))}
                >
                  {c}
                </button>
              </span>
            ))}
            {currentPath && (
              <Button size="xs" variant="ghost" className="ms-2" onClick={goUp}>
                Up level
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* TABLE VIEW */}
          {viewMode === "table" && (
            <DataTable
              rows={files}
              columns={columns}
              rowKey={(f) => f.id}
              searchPlaceholder="Search files / mime type…"
              empty={loading ? "Loading files…" : "Empty folder — upload files or create a directory"}
              defaultPageSize={pageSize}
              initialSortKey={sortKey}
              initialSortDir={sortDir}
              onPageSizeChange={setPageSize}
              onSortChange={(key, dir) => setSort(key, dir)}
              onRowDoubleClick={(f) => (f.isDir ? openDir(f.name) : handlePreview(f))}
            />
          )}

          {/* GRID VIEW */}
          {viewMode === "grid" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="group relative flex flex-col items-center justify-center rounded-2xl border p-4 text-center transition-all hover:border-primary/50 hover:bg-muted/30 hover:shadow-sm"
                    onDoubleClick={() => (f.isDir ? openDir(f.name) : handlePreview(f))}
                  >
                    <div className="mb-2 flex size-14 items-center justify-center rounded-2xl bg-muted/40 transition-transform group-hover:scale-105">
                      {f.isDir ? (
                        <Folder className="size-8 text-amber-500 fill-amber-500/20" />
                      ) : f.mimeType?.startsWith("image/") ? (
                        <ImageIcon className="size-8 text-blue-500" />
                      ) : f.mimeType?.startsWith("video/") ? (
                        <Film className="size-8 text-purple-500" />
                      ) : f.mimeType?.startsWith("audio/") ? (
                        <Music className="size-8 text-emerald-500" />
                      ) : f.mimeType?.startsWith("text/") || f.name.match(/\.(json|ts|tsx|js|jsx|py|sh|md)$/i) ? (
                        <FileCode className="size-8 text-amber-600" />
                      ) : (
                        <FileIcon className="size-8 text-muted-foreground" />
                      )}
                    </div>
                    <span className="w-full truncate text-xs font-medium">{f.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {f.isDir ? "Directory" : formatBytes(f.size)}
                    </span>

                    {/* Hover Actions */}
                    <div className="absolute top-2 end-2 hidden gap-1 group-hover:flex">
                      {!f.isDir && (
                        <Button
                          size="icon-xs"
                          variant="secondary"
                          onClick={() => handlePreview(f)}
                          title="Preview"
                        >
                          <Eye className="size-3" />
                        </Button>
                      )}
                      <Button
                        size="icon-xs"
                        variant="secondary"
                        onClick={async () => {
                          if (!confirm(`Delete ${f.name}?`)) return;
                          await remove(f.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {!loading && files.length === 0 && (
                <div className="flex h-32 flex-col items-center justify-center text-sm text-muted-foreground">
                  Empty folder — upload files or create a directory
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onDelete={remove}
      />
    </div>
  );
}
