"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  FileIcon,
  Download,
  Trash2,
  Copy,
  Check,
  Music,
  Maximize2,
  FileText,
  FileCode,
  Image as ImageIcon,
  Film,
  ExternalLink,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog";

// Dynamically import @cyntler/react-doc-viewer to prevent SSR window/document reference issues in Next.js
const DocViewer = dynamic(() => import("@cyntler/react-doc-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      Loading document viewer…
    </div>
  ),
});

export type FilePreviewRow = {
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

export function FilePreviewModal({
  file,
  open,
  onOpenChange,
  onDelete,
}: {
  file: FilePreviewRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const previewUrl = file ? `/api/admin/files?preview=1&id=${encodeURIComponent(file.id)}` : "";
  const downloadUrl = file ? `/api/admin/files?download=1&id=${encodeURIComponent(file.id)}` : "";

  const ext = file ? file.name.split(".").pop()?.toLowerCase() || "" : "";
  const mime = file?.mimeType?.toLowerCase() || "";

  const isImage =
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "heic"].includes(ext);

  const isVideo =
    mime.startsWith("video/") ||
    ["mp4", "webm", "mov", "mkv", "avi", "m4v"].includes(ext);

  const isAudio =
    mime.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(ext);

  const isTextOrCode =
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    [
      "txt",
      "json",
      "md",
      "js",
      "ts",
      "tsx",
      "jsx",
      "html",
      "css",
      "py",
      "sh",
      "bat",
      "csv",
      "xml",
      "yml",
      "yaml",
      "log",
      "env",
    ].includes(ext);

  const isDocViewerSupported =
    ["pdf", "docx", "xlsx", "pptx", "csv"].includes(ext) ||
    mime === "application/pdf" ||
    mime.includes("officedocument");

  useEffect(() => {
    setImgError(false);
    setTextContent(null);
    setCopied(false);

    if (open && file && isTextOrCode && !file.isDir) {
      setLoadingText(true);
      fetch(previewUrl)
        .then((res) => (res.ok ? res.text() : Promise.reject("Fetch failed")))
        .then((text) => setTextContent(text))
        .catch(() => setTextContent("Error loading file text preview."))
        .finally(() => setLoadingText(false));
    }
  }, [open, file, isTextOrCode, previewUrl]);

  async function copyText() {
    if (!textContent) return;
    await navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[95vw] max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl">
        {/* Header */}
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pe-8">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/50">
                {isImage && <ImageIcon className="size-5 text-blue-500" />}
                {isVideo && <Film className="size-5 text-purple-500" />}
                {isAudio && <Music className="size-5 text-emerald-500" />}
                {isTextOrCode && <FileCode className="size-5 text-amber-500" />}
                {!isImage && !isVideo && !isAudio && !isTextOrCode && (
                  <FileIcon className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate font-semibold text-base">
                  {file.name}
                </DialogTitle>
                <DialogDescription className="truncate text-xs font-mono text-muted-foreground">
                  {file.path}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {formatBytes(file.size)}
              </Badge>
              {file.mimeType && (
                <Badge variant="secondary" className="hidden font-mono text-xs sm:inline-flex">
                  {file.mimeType}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* IMAGE PREVIEW */}
          {isImage && !imgError && (
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="relative flex max-h-[60vh] w-full items-center justify-center overflow-hidden rounded-2xl border bg-black/5 p-2 dark:bg-black/40">
                {/* eslint-disable-next-html-element-suppression */}
                <img
                  src={previewUrl}
                  alt={file.name}
                  onError={() => setImgError(true)}
                  className="max-h-[55vh] max-w-full rounded-lg object-contain shadow-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                High-resolution image preview · Click download for original file
              </p>
            </div>
          )}

          {/* VIDEO PREVIEW */}
          {isVideo && (
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-full overflow-hidden rounded-2xl border bg-black">
                <video
                  src={previewUrl}
                  controls
                  autoPlay={false}
                  className="max-h-[60vh] w-full rounded-xl"
                >
                  Your browser does not support HTML5 video preview.
                </video>
              </div>
            </div>
          )}

          {/* AUDIO PREVIEW */}
          {isAudio && (
            <div className="flex flex-col items-center justify-center space-y-6 py-8">
              <div className="flex size-24 items-center justify-center rounded-3xl border bg-gradient-to-b from-emerald-500/10 to-teal-500/20 text-emerald-500 shadow-inner dark:from-emerald-500/20 dark:to-teal-500/30">
                <Music className="size-12 animate-pulse" />
              </div>
              <div className="w-full max-w-md space-y-2 text-center">
                <h4 className="font-semibold text-lg">{file.name}</h4>
                <p className="text-xs text-muted-foreground font-mono">
                  Audio Track · {formatBytes(file.size)}
                </p>
                <audio src={previewUrl} controls className="mt-4 w-full" />
              </div>
            </div>
          )}

          {/* TEXT / CODE PREVIEW */}
          {isTextOrCode && !isImage && !isVideo && !isAudio && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="size-4" />
                  <span>
                    {textContent
                      ? `${textContent.split("\n").length} lines · ${textContent.length} chars`
                      : "Text preview"}
                  </span>
                </div>
                {textContent && (
                  <Button size="xs" variant="outline" onClick={copyText}>
                    {copied ? (
                      <>
                        <Check className="size-3 text-emerald-500" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" /> Copy Content
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="relative max-h-[55vh] min-h-[16rem] overflow-auto rounded-2xl border bg-zinc-950 p-4 font-mono text-xs text-zinc-100 dark:bg-black">
                {loadingText ? (
                  <div className="flex h-32 items-center justify-center text-zinc-400">
                    Loading file contents…
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-all leading-relaxed">
                    {textContent || "No content to display."}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* DOC VIEWER FOR PDF & OFFICE DOCS */}
          {isDocViewerSupported && !isImage && !isVideo && !isAudio && !isTextOrCode && (
            <div className="flex flex-col space-y-3">
              <div className="min-h-[50vh] w-full overflow-hidden rounded-2xl border bg-background">
                <DocViewer
                  documents={[{ uri: previewUrl, fileName: file.name }]}
                  style={{ minHeight: "50vh", borderRadius: "1rem" }}
                  theme={{
                    primary: "hsl(var(--primary))",
                    textPrimary: "hsl(var(--foreground))",
                  }}
                />
              </div>
            </div>
          )}

          {/* PDF IFRAME FALLBACK IF NOT HANDLED ABOVE */}
          {mime === "application/pdf" && !isDocViewerSupported && (
            <iframe
              src={previewUrl}
              className="h-[60vh] w-full rounded-2xl border"
              title={file.name}
            />
          )}

          {/* FALLBACK BINARY CARD */}
          {!isImage &&
            !isVideo &&
            !isAudio &&
            !isTextOrCode &&
            !isDocViewerSupported &&
            mime !== "application/pdf" && (
              <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
                <div className="flex size-20 items-center justify-center rounded-3xl border bg-muted/40">
                  <FileIcon className="size-10 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-medium text-base">{file.name}</h4>
                  <p className="text-xs text-muted-foreground font-mono">
                    No inline preview renderer available for this file type.
                  </p>
                </div>
                <Button render={<a href={downloadUrl} download={file.name} />}>
                  <Download className="size-4" /> Download File ({formatBytes(file.size)})
                </Button>
              </div>
            )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t px-6 py-3">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Last updated: {new Date(file.updatedAt).toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              {onDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    if (!confirm(`Delete ${file.name}?`)) return;
                    await onDelete(file.id);
                    onOpenChange(false);
                  }}
                >
                  <Trash2 className="size-4" /> Delete
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                render={<a href={previewUrl} target="_blank" rel="noreferrer" />}
              >
                <ExternalLink className="size-4" /> Open in tab
              </Button>
              <Button size="sm" render={<a href={downloadUrl} download={file.name} />}>
                <Download className="size-4" /> Download
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
