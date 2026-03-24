/**
 * Next.js Edge Middleware — route protection
 *
 * Public routes: /auth/* and /api/auth/*
 * All other routes require a valid `procurement_session` JWT cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

if (!process.env.JWT_SECRET) {
  throw new Error(
    "[middleware] JWT_SECRET environment variable is not set. " +
    "Set a strong random secret in .env.local before starting the server."
  );
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const PUBLIC_PATHS = ["/auth/", "/api/auth/", "/_next/", "/favicon.ico"];
// Vendor-facing public routes (no login required)
const PUBLIC_PATTERNS = [/^\/api\/po\/[^/]+\/vendor-ack$/];

// ── Method allowlist — enforced before JWT check ────────────────────────────
const ALLOWED_METHODS: Record<string, string[]> = {
  "/api/pr/mpr":           ["GET", "POST"],
  "/api/pr/spr":           ["GET", "POST"],
  "/api/po":               ["GET", "POST"],
  "/api/grn":              ["GET", "POST"],
  "/api/srn":              ["GET", "POST", "PATCH"],
  "/api/vendors":          ["GET", "POST"],
  "/api/payments":         ["GET", "POST"],
  "/api/match":            ["GET", "POST", "PATCH"],
  "/api/flags":            ["GET", "POST"],
  "/api/invoices/upload":  ["GET", "POST"],
  "/api/admin/users":      ["GET", "POST"],
  "/api/reports":          ["GET"],
  "/api/search":           ["GET"],
  "/api/dropdowns":        ["GET"],
  "/api/auth/login":       ["POST"],
  "/api/auth/logout":      ["POST"],
  "/api/auth/me":          ["GET"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Reject unsupported methods on known API routes (returns proper JSON 405)
  const allowed = ALLOWED_METHODS[pathname];
  if (allowed && !allowed.includes(req.method)) {
    return NextResponse.json(
      { error: `Method ${req.method} not allowed. Supported: ${allowed.join(", ")}` },
      { status: 405, headers: { Allow: allowed.join(", ") } }
    );
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (PUBLIC_PATTERNS.some((r) => r.test(pathname))) {
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
