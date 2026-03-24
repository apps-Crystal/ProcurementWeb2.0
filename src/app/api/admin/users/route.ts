/**
 * GET  /api/admin/users   — list all users (System_Admin only)
 * POST /api/admin/users   — create a new user (System_Admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId, writeAuditLog } from "@/lib/sheets";
import { hashPassword } from "@/lib/auth";

function requireAdmin(req: NextRequest) {
  const role = req.headers.get("x-user-role");
  if (role !== "System_Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const users = await readSheet("USERS");
  // Strip nothing — no passwords in USERS sheet, safe to return
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const actorId   = req.headers.get("x-user-id")   ?? "";
  const actorName = req.headers.get("x-user-name")  ?? "";
  const actorRole = req.headers.get("x-user-role")  ?? "";
  const ip        = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fullName, email, phone, department, site, role, password,
          isProcurementHead, isFinanceHead, isSiteHead,
          approvalSites, paymentApprovalLimit } = body;

  if (!fullName || !email || !role || !password) {
    return NextResponse.json({ error: "fullName, email, role, and password are required" }, { status: 400 });
  }

  // ── BUG-U1: Email format validation ─────────────────────────────────────────
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const normalizedEmail = email.toLowerCase().trim();
  if (!EMAIL_RE.test(normalizedEmail)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // ── BUG-U2: Role whitelist ───────────────────────────────────────────────────
  const VALID_ROLES = [
    "Requestor", "Procurement_Team", "Procurement_Head",
    "Accounts", "Finance", "Management",
    "Warehouse", "Site_Head", "Designated_Approver", "System_Admin",
  ];
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  // ── BUG-U3: Password policy ──────────────────────────────────────────────────
  const PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!PW_RE.test(password)) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters and include uppercase, lowercase, a digit, and a special character" },
      { status: 400 }
    );
  }

  // ── BUG-U4: XSS sanitization ─────────────────────────────────────────────────
  const sanitize = (s: unknown): string =>
    String(s ?? "")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");

  const safeFullName   = sanitize(fullName.trim());
  const safeDepartment = sanitize(department ?? "");
  const safeSite       = sanitize(site ?? "");
  const safePhone      = sanitize(phone ?? "");

  if (safeFullName.length < 2) {
    return NextResponse.json({ error: "Full name must be at least 2 characters" }, { status: 400 });
  }

  // ── BUG-U1b: Strengthened email uniqueness (normalized comparison) ───────────
  const existing = await readSheet("USERS");
  if (existing.some((u: any) => (u.EMAIL ?? "").toLowerCase().trim() === normalizedEmail)) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const seq    = await getNextSeq("USERS");
  let userId = generateId("USR", seq);
  if (existing.some((u: any) => u.USER_ID === userId)) {
    userId = generateId("USR", await getNextSeq("USERS"));
  }
  const now    = new Date().toISOString();

  await appendRowByFields("USERS", {
    USER_ID:                    userId,
    FULL_NAME:                  safeFullName,
    EMAIL:                      normalizedEmail,
    PHONE:                      safePhone,
    DEPARTMENT:                 safeDepartment,
    SITE:                       safeSite,
    ROLE:                       role,
    IS_PROCUREMENT_HEAD:        isProcurementHead === "Y" ? "Y" : "N",
    IS_FINANCE_HEAD:            isFinanceHead     === "Y" ? "Y" : "N",
    IS_SITE_HEAD:               isSiteHead        === "Y" ? "Y" : "N",
    APPROVAL_SITES:             approvalSites ?? "",
    PAYMENT_APPROVAL_LIMIT_INR: paymentApprovalLimit ?? "0",
    STATUS:                     "ACTIVE",
    ACCOUNT_LOCKED:             "N",
    LAST_LOGIN_DATE:            "",
    PASSWORD_LAST_CHANGED:      now,
    ACCESS_REQUEST_DATE:        now,
    PROVISIONED_BY:             actorId,
    PROVISIONED_DATE:           now,
    MANAGER_APPROVED_BY:        "",
    REVOCATION_DATE:            "",
    REVOCATION_REASON:          "",
    LAST_UPDATED_BY:            actorId,
    LAST_UPDATED_DATE:          now,
  });

  const passwordHash = hashPassword(password);
  await appendRowByFields("USER_AUTH", {
    USER_ID:             userId,
    PASSWORD_HASH:       passwordHash,
    FAILED_LOGIN_COUNT:  "0",
    RESET_TOKEN:         "",
    RESET_TOKEN_EXPIRY:  "",
  });

  await writeAuditLog({
    userId:       actorId,
    userName:     actorName,
    userRole:     actorRole,
    ipAddress:    ip,
    module:       "USERS",
    recordId:     userId,
    action:       "USER_CREATED",
    fieldChanged: "STATUS",
    newValue:     "ACTIVE",
    remarks:      `User ${safeFullName} (${normalizedEmail}) created with role ${role}`,
  });

  return NextResponse.json({ userId }, { status: 201 });
}
