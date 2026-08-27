"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";

type LanHost = {
  hostname: string;
  url: string;
  port: number;
  source: string;
  needsSetup: boolean;
};

export function HostnameSetup() {
  const [info, setInfo] = useState<LanHost | null>(null);
  const [value, setValue] = useState("zoro.local");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/admin/hostname");
      const j = (await r.json()) as LanHost & { error?: string };
      if (!r.ok) throw new Error(j.error || r.statusText);
      setInfo(j);
      setValue(j.hostname || "zoro.local");
      if (j.needsSetup) setOpen(true);
    } catch {
      // Dashboard still loads; user can open the dialog from Change hostname.
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/hostname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: value }),
      });
      const j = (await r.json()) as LanHost & { error?: string };
      if (!r.ok) throw new Error(j.error || r.statusText);
      setInfo(j);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save hostname");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>LAN hostname</CardTitle>
          <CardDescription>
            Phones, passkeys, and Google sign-in should use this name (not a
            raw IP). Default on this PC is zoro.local.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            {info?.url || "http://zoro.local:38480"}
          </code>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Change hostname
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set LAN hostname</AlertDialogTitle>
            <AlertDialogDescription>
              Passkeys cannot use a numeric IP. Enter this PC&apos;s mDNS name
              (usually ComputerName.local). Example: zoro.local
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="zoro.local"
            autoCapitalize="none"
            autoCorrect="off"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Later</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || !value.trim()}
              onClick={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {saving ? "Saving…" : "Save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
