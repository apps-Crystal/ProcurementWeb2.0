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
import nodemailer from "nodemailer";
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

async function sendResetEmail(email: string, resetLink: string, userName: string) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Crystal Group Procurement" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Password Reset — Crystal Group Procurement",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
        <h2 style="color:#1e3a5f;margin-top:0;">Password Reset Request</h2>
        <p style="color:#374151;">Hi ${userName},</p>
        <p style="color:#374151;">We received a request to reset your password for the Crystal Group Procurement system.</p>
        <p style="color:#374151;">Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetLink}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#1e3a5f;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
          Reset Password
        </a>
        <p style="color:#6b7280;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="color:#6b7280;font-size:12px;word-break:break-all;">${resetLink}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="color:#9ca3af;font-size:11px;">If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
        <p style="color:#9ca3af;font-size:11px;">— Crystal Group Procurement System</p>
      </div>
    `,
  });

  console.log(`[AUTH] Password reset email sent to ${email}`);
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

    await sendResetEmail(email, resetLink, user.FULL_NAME ?? "there");
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
