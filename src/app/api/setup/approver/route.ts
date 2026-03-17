/**
 * GET /api/setup/approver?password=<password>&secret=crystal-setup-2024
 *
 * One-time route to seed the Procurement Approver (admin 2) account.
 * Creates approver@crystalgroup.in with System_Admin + Procurement_Head role.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, generateId, getNextSeq, writeAuditLog } from "@/lib/sheets";
import { hashPassword } from "@/lib/auth";

const APPROVER_EMAIL = "approver@crystalgroup.in";
const APPROVER_NAME  = "Procurement Approver";
const APPROVER_ROLE  = "System_Admin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const password = searchParams.get("password");
    const secret   = searchParams.get("secret");

    const expectedSecret = process.env.SETUP_SECRET ?? "crystal-setup-2024";
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: "Invalid setup secret." }, { status: 403 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password is required and must be at least 6 characters." },
        { status: 400 }
      );
    }

    // ── Check if already exists ─────────────────────────────────────────────
    const users = await readSheet("USERS");
    const existing = users.find((u) => u.EMAIL?.toLowerCase() === APPROVER_EMAIL);
    if (existing) {
      // Check if USER_AUTH entry exists too
      const authRows = await readSheet("USER_AUTH");
      const authExists = authRows.find((r) => r.USER_ID === existing.USER_ID);
      if (!authExists) {
        // Auth row missing — create it
        const passwordHash = hashPassword(password);
        await appendRowByFields("USER_AUTH", {
          USER_ID:            existing.USER_ID,
          PASSWORD_HASH:      passwordHash,
          FAILED_LOGIN_COUNT: "0",
          RESET_TOKEN:        "",
          RESET_TOKEN_EXPIRY: "",
        });
        return NextResponse.json({
          success: true,
          message: "Approver user existed but auth was missing — password has been set.",
          user_id: existing.USER_ID,
        });
      }
      return NextResponse.json({
        message: "Approver account already exists. No changes made.",
        user_id: existing.USER_ID,
      });
    }

    // ── Generate user ID ────────────────────────────────────────────────────
    const seq    = await getNextSeq("USERS");
    const userId = generateId("USR", seq);
    const now    = new Date().toISOString();

    await appendRowByFields("USERS", {
      USER_ID:               userId,
      EMAIL:                 APPROVER_EMAIL,
      FULL_NAME:             APPROVER_NAME,
      ROLE:                  APPROVER_ROLE,
      SITE:                  "HEAD_OFFICE",
      IS_PROCUREMENT_HEAD:   "Y",
      IS_FINANCE_HEAD:       "N",
      IS_SITE_HEAD:          "N",
      STATUS:                "ACTIVE",
      ACCOUNT_LOCKED:        "N",
      LAST_LOGIN_DATE:       "",
      PASSWORD_LAST_CHANGED: now,
      CREATED_AT:            now,
      CREATED_BY:            "SYSTEM",
      UPDATED_AT:            now,
    });

    // ── Create USER_AUTH entry ──────────────────────────────────────────────
    const passwordHash = hashPassword(password);
    await appendRowByFields("USER_AUTH", {
      USER_ID:             userId,
      PASSWORD_HASH:       passwordHash,
      FAILED_LOGIN_COUNT:  "0",
      RESET_TOKEN:         "",
      RESET_TOKEN_EXPIRY:  "",
    });

    await writeAuditLog({ userId: "SYSTEM", module: "USERS", recordId: userId, action: "USER_CREATED", remarks: `Seeded approver: ${APPROVER_EMAIL}` });

    return NextResponse.json({
      success: true,
      message: "Approver account created successfully.",
      user_id: userId,
      email:   APPROVER_EMAIL,
      role:    APPROVER_ROLE,
    });
  } catch (err) {
    console.error("[setup/approver]", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
