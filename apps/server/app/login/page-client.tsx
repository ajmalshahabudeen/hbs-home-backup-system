"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HardDrive } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    search.get("error") === "admin_only"
      ? "Only administrators can access the console."
      : null
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: resError } = await authClient.signIn.email({
        email,
        password,
      });
      if (resError) {
        setError(resError.message || "Invalid email or password.");
        return;
      }

      // Verify admin role via session
      const session = await authClient.getSession();
      const role = (session.data?.user as { role?: string } | undefined)?.role;
      if (role !== "admin") {
        await authClient.signOut();
        setError("Only administrators can access this console.");
        return;
      }

      router.push(search.get("next") || "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-[radial-gradient(ellipse_at_top,oklch(0.9_0.08_90/.3),transparent_55%)] p-4 dark:bg-[radial-gradient(ellipse_at_top,oklch(0.35_0.06_90/.2),transparent_55%)]">
      <Card className="w-full max-w-md border-border/60 bg-card/80 backdrop-blur">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <HardDrive className="size-4 text-primary" />
            HBS Admin
          </div>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Admin credentials only. Client backups use separate user accounts
            later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@home.local"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/register" className="ms-1 font-medium text-foreground underline-offset-4 hover:underline">
            Register
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
