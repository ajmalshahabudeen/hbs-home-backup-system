import { auth } from "@workspace/auth";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const { pathname } = request.nextUrl;
  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/register");
  const isPublic =
    isAuthPage ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname === "/";

  const who = session?.user?.email || "-";
  console.log(
    `\x1b[1;36mHBS\x1b[0m \x1b[90m│\x1b[0m \x1b[1;36m[PROXY ]\x1b[0m ${request.method} ${pathname}  session=${who}`,
  );

  if (!session && pathname.startsWith("/dashboard")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && isAuthPage) {
    const role = (session.user as { role?: string | null }).role;
    if (role === "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    // Non-admins stay off the admin console
    return NextResponse.redirect(
      new URL("/login?error=admin_only", request.url),
    );
  }

  if (session && pathname.startsWith("/dashboard")) {
    const role = (session.user as { role?: string | null }).role;
    if (role !== "admin") {
      return NextResponse.redirect(
        new URL("/login?error=admin_only", request.url),
      );
    }
  }

  if (!isPublic && !session && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
