/**
 * POST /api/auth/login
 *
 * Body: { email: string; password: string }
 *
 * 1. Looks up user in USERS sheet by EMAIL
 * 2. Checks STATUS === ACTIVE and ACCOUNT_LOCKED !== Y
 * 3. Reads PASSWORD_HASH from USER_AUTH sheet
 * 4. Verifies password (scrypt)
 * 5. On failure: increments FAILED_LOGIN_COUNT, locks after 5 attempts
 * 6. On success: resets count, updates LAST_LOGIN_DATE, signs JWT, sets cookie
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";
import {
  verifyPassword,
  signJwt,
  COOKIE_NAME,
  sessionCookieOptions,
  type SessionUser,
} from "@/lib/auth";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  // ── 1. Find user ───────────────────────────────────────────────────────────
  const users = await readSheet("USERS");
  const user = users.find((u) => u.EMAIL?.toLowerCase() === email.toLowerCase());

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  // ── 2. Account status checks ───────────────────────────────────────────────
  if (user.STATUS === "INACTIVE") {
    return NextResponse.json(
      { error: "Your account has been deactivated. Contact System Admin." },
      { status: 403 }
    );
  }

  if (user.ACCOUNT_LOCKED === "Y") {
    return NextResponse.json(
      { error: "Account locked after too many failed attempts. Contact System Admin." },
      { status: 403 }
    );
  }

  // ── 3. Load auth record ────────────────────────────────────────────────────
  const authRows = await readSheet("USER_AUTH");
  const authRow = authRows.find((r) => r.USER_ID === user.USER_ID);

  if (!authRow?.PASSWORD_HASH) {
    return NextResponse.json(
      { error: "Account not yet activated. Please use the password setup link sent to you." },
      { status: 403 }
    );
  }

  // ── 4. Verify password ─────────────────────────────────────────────────────
  const valid = verifyPassword(password, authRow.PASSWORD_HASH);
  const failCount = parseInt(authRow.FAILED_LOGIN_COUNT ?? "0", 10);

  if (!valid) {
    const newCount = failCount + 1;
    await updateRowWhere("USER_AUTH", "USER_ID", user.USER_ID, {
      FAILED_LOGIN_COUNT: newCount,
    });

    if (newCount >= MAX_ATTEMPTS) {
      await updateRowWhere("USERS", "USER_ID", user.USER_ID, {
        ACCOUNT_LOCKED: "Y",
        STATUS: "LOCKED",
      });
      await writeAuditLog({ userId: user.USER_ID, userName: user.FULL_NAME, userRole: user.ROLE, ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "", module: "USERS", recordId: user.USER_ID, action: "ACCOUNT_LOCKED", remarks: `Locked after ${MAX_ATTEMPTS} failed attempts` });
      return NextResponse.json(
        { error: `Account locked after ${MAX_ATTEMPTS} failed attempts. Contact System Admin.` },
        { status: 403 }
      );
    }

    const remaining = MAX_ATTEMPTS - newCount;
    return NextResponse.json(
      { error: `Invalid email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before lockout.` },
      { status: 401 }
    );
  }

  // ── 5. Success — reset fail count, update last login ──────────────────────
  const now = new Date().toISOString();
  await Promise.all([
    updateRowWhere("USER_AUTH", "USER_ID", user.USER_ID, { FAILED_LOGIN_COUNT: 0 }),
    updateRowWhere("USERS", "USER_ID", user.USER_ID, { LAST_LOGIN_DATE: now }),
  ]);

  // ── 6. Password rotation warning (90 days) ─────────────────────────────────
  let passwordWarning: string | null = null;
  if (user.PASSWORD_LAST_CHANGED) {
    const daysSince = Math.floor(
      (Date.now() - new Date(user.PASSWORD_LAST_CHANGED).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince >= 90) {
      passwordWarning = `Your password is ${daysSince} days old. Please change it soon (SOP §16.2).`;
    }
  }

  // ── 7. Sign JWT and set cookie ─────────────────────────────────────────────
  const sessionUser: SessionUser = {
    userId:            user.USER_ID,
    email:             user.EMAIL,
    name:              user.FULL_NAME,
    role:              user.ROLE,
    site:              user.SITE,
    isProcurementHead: user.IS_PROCUREMENT_HEAD === "Y",
    isFinanceHead:     user.IS_FINANCE_HEAD === "Y",
    isSiteHead:        user.IS_SITE_HEAD === "Y",
  };

  const jwt = await signJwt(sessionUser);

  await writeAuditLog({ userId: user.USER_ID, userName: user.FULL_NAME, userRole: user.ROLE, ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "", module: "USERS", recordId: user.USER_ID, action: "LOGIN" });

  const res = NextResponse.json({
    success: true,
    user: sessionUser,
    passwordWarning,
  });

  res.cookies.set(COOKIE_NAME, jwt, sessionCookieOptions());
  return res;
}
