/**
 * GET   /api/admin/users/[id]  — fetch single user (System_Admin only)
 * PATCH /api/admin/users/[id]  — update user role / status / flags (System_Admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";

function requireAdmin(req: NextRequest) {
  const role = req.headers.get("x-user-role");
  if (role !== "System_Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const users = await readSheet("USERS");
  const user  = users.find((u) => u.USER_ID === id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
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

  // Load current user to capture old values for audit
  const users = await readSheet("USERS");
  const current = users.find((u) => u.USER_ID === id);
  if (!current) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const now = new Date().toISOString();

  // Only allow these fields to be updated
  const ALLOWED: Record<string, string> = {
    ROLE:                       body.ROLE                       ?? "",
    STATUS:                     body.STATUS                     ?? "",
    ACCOUNT_LOCKED:             body.ACCOUNT_LOCKED             ?? "",
    IS_PROCUREMENT_HEAD:        body.IS_PROCUREMENT_HEAD        ?? "",
    IS_FINANCE_HEAD:            body.IS_FINANCE_HEAD            ?? "",
    IS_SITE_HEAD:               body.IS_SITE_HEAD               ?? "",
    APPROVAL_SITES:             body.APPROVAL_SITES             ?? "",
    PAYMENT_APPROVAL_LIMIT_INR: body.PAYMENT_APPROVAL_LIMIT_INR ?? "",
    DEPARTMENT:                 body.DEPARTMENT                 ?? "",
    SITE:                       body.SITE                       ?? "",
    PHONE:                      body.PHONE                      ?? "",
  };

  // Only include fields that were actually sent (non-empty string means caller wants to update)
  const updates: Record<string, string> = { LAST_UPDATED_BY: actorId, LAST_UPDATED_DATE: now };
  const changedFields: string[] = [];

  for (const [field, newVal] of Object.entries(ALLOWED)) {
    if (field in body && newVal !== current[field]) {
      updates[field] = newVal;
      changedFields.push(field);
    }
  }

  if (changedFields.length === 0) {
    return NextResponse.json({ message: "No changes detected" });
  }

  await updateRowWhere("USERS", "USER_ID", id, updates);

  // If account is being unlocked, also reset FAILED_LOGIN_COUNT in USER_AUTH
  if (body.ACCOUNT_LOCKED === "N" && current.ACCOUNT_LOCKED !== "N") {
    await updateRowWhere("USER_AUTH", "USER_ID", id, { FAILED_LOGIN_COUNT: "0" });
  }

  // Write one audit log entry per changed field
  for (const field of changedFields) {
    await writeAuditLog({
      userId:       actorId,
      userName:     actorName,
      userRole:     actorRole,
      ipAddress:    ip,
      module:       "USERS",
      recordId:     id,
      action:       "USER_UPDATED",
      fieldChanged: field,
      oldValue:     current[field] ?? "",
      newValue:     updates[field] ?? "",
    });
  }

  return NextResponse.json({ message: "User updated" });
}
