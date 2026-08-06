export function formatBytes(n: number | null | undefined): string {
  const v = Number(n || 0);
  if (!Number.isFinite(v) || v < 0) return "0 B";
  if (v < 1024) return `${Math.round(v)} B`;
  const u = ["KB", "MB", "GB", "TB", "PB"];
  let i = -1;
  let x = v;
  do {
    x /= 1024;
    i++;
  } while (x >= 1024 && i < u.length - 1);
  return `${x.toFixed(x >= 10 || i === 0 ? 1 : 2)} ${u[i]}`;
}

export function formatPercent(n: number | null | undefined): string {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0%";
  return `${Math.round(v * 10) / 10}%`;
}

export function relativeTime(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
