/**
 * Next.js Edge Middleware — route protection
 *
 * Public routes: /auth/* and /api/auth/*
 * All other routes require a valid `procurement_session` JWT cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "change-me-in-production"
);

const PUBLIC_PATHS = ["/auth/", "/api/auth/", "/api/setup/", "/_next/", "/favicon.ico"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("procurement_session")?.value;

  if (!token) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Forward user identity to server components via request headers
    const res = NextResponse.next();
    res.headers.set("x-user-id",   String(payload.userId ?? ""));
    res.headers.set("x-user-role", String(payload.role   ?? ""));
    res.headers.set("x-user-site", String(payload.site   ?? ""));
    return res;
  } catch {
    // Token invalid or expired — redirect to login
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete("procurement_session");
    return res;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
