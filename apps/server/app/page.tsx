import Link from "next/link";
import { HardDrive, Shield } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

export default function HomePage() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.9_0.08_90/.35),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,oklch(0.4_0.08_90/.25),transparent_55%)]" />
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <HardDrive className="size-5 text-primary" />
          HBS Admin
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" render={<Link href="/login" />}>
            Login
          </Button>
          <Button render={<Link href="/register" />}>Register</Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <Shield className="size-3.5" />
          Admin-only console · Drive + Photos style backups
        </div>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Home Backup System
        </h1>
        <p className="max-w-xl text-pretty text-muted-foreground">
          Central server for family backups. Admins manage users, browse every
          user&apos;s files on the mounted hard drive, and audit full system
          logs. Mobile / desktop clients connect later with regular user
          accounts.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" render={<Link href="/login" />}>
            Open admin login
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/register" />}>
            Create first admin
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          First registered account is automatically granted{" "}
          <span className="font-medium text-foreground">admin</span>.
        </p>
      </main>
    </div>
  );
}
