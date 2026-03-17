/**
 * Auth utilities — Crystal Group Procurement System
 *
 * Password hashing  : Node crypto.scryptSync  (Node runtime only)
 * JWT sign/verify   : jose                    (Edge + Node compatible)
 * Session cookie    : procurement_session     (HttpOnly, SameSite=Lax)
 * Reset token       : 32-byte hex, 1-hour TTL stored in USER_AUTH sheet
 *
 * USER_AUTH sheet columns (add to Google Sheet manually):
 *   USER_ID | PASSWORD_HASH | FAILED_LOGIN_COUNT | RESET_TOKEN | RESET_TOKEN_EXPIRY
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import crypto from "crypto";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "change-me-in-production"
);
const COOKIE_NAME = "procurement_session";
const TOKEN_EXPIRY  = "8h";
const RESET_TTL_MS  = 60 * 60 * 1000; // 1 hour

// ─────────────────────────────────────────────────────────────────────────────
// Password hashing — Node runtime only
// ─────────────────────────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(derived, "hex")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT — works in Edge + Node
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionUser {
  userId: string;
  email:  string;
  name:   string;
  role:   string;
  site:   string;
  isProcurementHead: boolean;
  isFinanceHead:     boolean;
  isSiteHead:        boolean;
}

export async function signJwt(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user } as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyJwt(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset token
// ─────────────────────────────────────────────────────────────────────────────

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function resetTokenExpiry(): string {
  return new Date(Date.now() + RESET_TTL_MS).toISOString();
}

export function isResetTokenExpired(expiry: string): boolean {
  return Date.now() > new Date(expiry).getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookie helpers (for route handlers)
// ─────────────────────────────────────────────────────────────────────────────

export { COOKIE_NAME };

export function sessionCookieOptions(maxAgeSeconds = 8 * 60 * 60) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
