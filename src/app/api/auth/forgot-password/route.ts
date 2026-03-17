/**
 * POST /api/auth/forgot-password
 *
 * Body: { email: string }
 *
 * 1. Looks up user by EMAIL in USERS sheet
 * 2. Generates a 32-byte hex reset token (1-hour TTL)
 * 3. Writes RESET_TOKEN + RESET_TOKEN_EXPIRY to USER_AUTH sheet
 * 4. In development: returns the reset link in the response
 *    In production:  send email via SMTP (configure SMTP_* env vars)
 *
 * IMPORTANT: Always respond with success even if email not found (prevents enumeration).
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, appendRowByFields, writeAuditLog } from "@/lib/sheets";
import { generateResetToken, resetTokenExpiry } from "@/lib/auth";

async function ensureAuthRow(userId: string) {
  const rows = await readSheet("USER_AUTH");
  const exists = rows.find((r) => r.USER_ID === userId);
  if (!exists) {
    // Create a blank auth row for this user
    await appendRowByFields("USER_AUTH", { USER_ID: userId, PASSWORD_HASH: "", FAILED_LOGIN_COUNT: "0", RESET_TOKEN: "", RESET_TOKEN_EXPIRY: "" });
  }
}

async function sendResetEmail(email: string, resetLink: string) {
  // ── Production: use SMTP ────────────────────────────────────────────────────
  // Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env.local
  // Uncomment and adapt:
  //
  // const transporter = nodemailer.createTransport({...});
  // await transporter.sendMail({
  //   from: `"Crystal Group" <${process.env.SMTP_FROM}>`,
  //   to: email,
  //   subject: "Password Reset — Crystal Group Procurement",
  //   html: `<p>Click to reset: <a href="${resetLink}">${resetLink}</a></p><p>Expires in 1 hour.</p>`,
  // });

  // ── Development: log to console ────────────────────────────────────────────
  console.log(`[AUTH] Password reset link for ${email}: ${resetLink}`);
}

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  const GENERIC_SUCCESS = {
    success: true,
    message: "If that email exists in our system, a reset link has been sent.",
  };

  if (!email) return NextResponse.json(GENERIC_SUCCESS);

  try {
    const users = await readSheet("USERS");
    const user = users.find((u) => u.EMAIL?.toLowerCase() === email.toLowerCase());

    if (!user || user.STATUS === "INACTIVE") {
      return NextResponse.json(GENERIC_SUCCESS);
    }

    const token = generateResetToken();
    const expiry = resetTokenExpiry();

    await ensureAuthRow(user.USER_ID);
    await updateRowWhere("USER_AUTH", "USER_ID", user.USER_ID, {
      RESET_TOKEN: token,
      RESET_TOKEN_EXPIRY: expiry,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetLink = `${appUrl}/auth/reset-password?token=${token}`;

    await sendResetEmail(email, resetLink);
    await writeAuditLog({ userId: user.USER_ID, module: "USERS", recordId: user.USER_ID, action: "PASSWORD_RESET_REQUESTED" });

    // In development return the link so it's testable without SMTP
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json({
      ...GENERIC_SUCCESS,
      ...(isDev ? { dev_reset_link: resetLink } : {}),
    });
  } catch (err) {
    console.error("[forgot-password]", err);
    // Still return generic success to prevent enumeration
    return NextResponse.json(GENERIC_SUCCESS);
  }
}
