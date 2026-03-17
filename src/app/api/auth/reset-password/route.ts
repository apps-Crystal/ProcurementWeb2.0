/**
 * POST /api/auth/reset-password
 *
 * Body: { token: string; password: string }
 *
 * 1. Finds USER_AUTH row where RESET_TOKEN === token
 * 2. Checks token has not expired
 * 3. Validates new password (min 8 chars, at least 1 digit, 1 uppercase)
 * 4. Hashes new password and writes to USER_AUTH
 * 5. Clears RESET_TOKEN, updates PASSWORD_LAST_CHANGED in USERS
 * 6. Unlocks account if it was locked
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";
import { hashPassword, isResetTokenExpired } from "@/lib/auth";

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8)           return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password))       return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(password))       return "Password must contain at least one number.";
  return null;
}

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();

  if (!token || !password) {
    return NextResponse.json({ error: "Token and new password are required." }, { status: 400 });
  }

  // ── Validate strength ──────────────────────────────────────────────────────
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    return NextResponse.json({ error: strengthError }, { status: 400 });
  }

  // ── Find auth row by reset token ───────────────────────────────────────────
  const authRows = await readSheet("USER_AUTH");
  const authRow = authRows.find((r) => r.RESET_TOKEN === token);

  if (!authRow) {
    return NextResponse.json({ error: "Invalid or already-used reset link." }, { status: 400 });
  }

  // ── Check expiry ───────────────────────────────────────────────────────────
  if (!authRow.RESET_TOKEN_EXPIRY || isResetTokenExpired(authRow.RESET_TOKEN_EXPIRY)) {
    return NextResponse.json(
      { error: "This reset link has expired. Please request a new one." },
      { status: 400 }
    );
  }

  const userId = authRow.USER_ID;
  const now = new Date().toISOString();
  const hash = hashPassword(password);

  // ── Update auth record ─────────────────────────────────────────────────────
  await updateRowWhere("USER_AUTH", "USER_ID", userId, {
    PASSWORD_HASH: hash,
    FAILED_LOGIN_COUNT: 0,
    RESET_TOKEN: "",
    RESET_TOKEN_EXPIRY: "",
  });

  // ── Update user record ─────────────────────────────────────────────────────
  await updateRowWhere("USERS", "USER_ID", userId, {
    PASSWORD_LAST_CHANGED: now,
    ACCOUNT_LOCKED: "N",
    STATUS: "ACTIVE",
    LAST_UPDATED_DATE: now,
  });

  await writeAuditLog({ userId, module: "USERS", recordId: userId, action: "PASSWORD_RESET" });

  return NextResponse.json({ success: true, message: "Password updated. You can now log in." });
}
