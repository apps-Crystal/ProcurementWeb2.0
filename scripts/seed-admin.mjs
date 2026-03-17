/**
 * Seed Admin User — Crystal Group Procurement System
 *
 * Creates a hardcoded System_Admin account in USERS + USER_AUTH sheets.
 *
 * Run once:
 *   node scripts/seed-admin.mjs
 *
 * Safe to re-run: skips creation if admin email already exists.
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { google } from "googleapis";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load .env.local
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.resolve(__dirname, "../.env.local");

if (!fs.existsSync(envPath)) {
  console.error("❌  .env.local not found. Copy .env.local.example and fill in values.");
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      const key = l.slice(0, idx).trim();
      let   val = l.slice(idx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Unescape \n in private key
      val = val.replace(/\\n/g, "\n");
      return [key, val];
    })
);

const SPREADSHEET_ID = env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SA_EMAIL       = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY    = env.GOOGLE_PRIVATE_KEY;

if (!SPREADSHEET_ID || !SA_EMAIL || !PRIVATE_KEY) {
  console.error("❌  Missing GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, or GOOGLE_PRIVATE_KEY in .env.local");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Admin credentials (hardcoded per requirement)
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_EMAIL    = "apps@crystalgroup.in";
const ADMIN_PASSWORD = "crpl@12342026";
const ADMIN_USER_ID  = "USR-ADMIN-001";

// ─────────────────────────────────────────────────────────────────────────────
// 3. Password hashing (same algorithm as src/lib/auth.ts)
// ─────────────────────────────────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Google Sheets helpers
// ─────────────────────────────────────────────────────────────────────────────

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: SA_EMAIL, private_key: PRIVATE_KEY },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function readSheet(sheets, name) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: name,
  });
  const rows = res.data.values ?? [];
  if (rows.length < 1) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
    return obj;
  });
}

async function appendRow(sheets, name, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${name}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Seed
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  const sheets = getSheets();
  const now    = new Date().toISOString();

  // ── Check if admin already exists ─────────────────────────────────────────
  const users = await readSheet(sheets, "USERS");
  const existing = users.find((u) => u.EMAIL?.toLowerCase() === ADMIN_EMAIL.toLowerCase());

  if (existing) {
    console.log(`ℹ️   Admin already exists (USER_ID: ${existing.USER_ID}). Nothing to do.`);
    return;
  }

  // ── Write USERS row ────────────────────────────────────────────────────────
  // Columns per createSheet_USERS in CrystalGroup_Procurement_Schema.gs:
  // USER_ID | FULL_NAME | EMAIL | PHONE | DEPARTMENT | SITE | ROLE |
  // IS_PROCUREMENT_HEAD | IS_FINANCE_HEAD | IS_SITE_HEAD | APPROVAL_SITES |
  // PAYMENT_APPROVAL_LIMIT_INR | STATUS | ACCOUNT_LOCKED | LAST_LOGIN_DATE |
  // PASSWORD_LAST_CHANGED | ACCESS_REQUEST_DATE | PROVISIONED_BY |
  // PROVISIONED_DATE | MANAGER_APPROVED_BY | REVOCATION_DATE |
  // REVOCATION_REASON | LAST_UPDATED_BY | LAST_UPDATED_DATE

  await appendRow(sheets, "USERS", [
    ADMIN_USER_ID,          // USER_ID
    "System Administrator", // FULL_NAME
    ADMIN_EMAIL,            // EMAIL
    "",                     // PHONE
    "IT",                   // DEPARTMENT
    "HO",                   // SITE
    "System_Admin",         // ROLE
    "Y",                    // IS_PROCUREMENT_HEAD
    "Y",                    // IS_FINANCE_HEAD
    "Y",                    // IS_SITE_HEAD
    "Noida,Mumbai,HO",      // APPROVAL_SITES
    "999999999",            // PAYMENT_APPROVAL_LIMIT_INR
    "ACTIVE",               // STATUS
    "N",                    // ACCOUNT_LOCKED
    "",                     // LAST_LOGIN_DATE
    now,                    // PASSWORD_LAST_CHANGED
    now,                    // ACCESS_REQUEST_DATE
    "SYSTEM",               // PROVISIONED_BY
    now,                    // PROVISIONED_DATE
    "SYSTEM",               // MANAGER_APPROVED_BY
    "",                     // REVOCATION_DATE
    "",                     // REVOCATION_REASON
    "SYSTEM",               // LAST_UPDATED_BY
    now,                    // LAST_UPDATED_DATE
  ]);
  console.log("✅  USERS row created.");

  // ── Write USER_AUTH row ────────────────────────────────────────────────────
  // Columns: USER_ID | PASSWORD_HASH | FAILED_LOGIN_COUNT | RESET_TOKEN | RESET_TOKEN_EXPIRY

  const passwordHash = hashPassword(ADMIN_PASSWORD);

  await appendRow(sheets, "USER_AUTH", [
    ADMIN_USER_ID,  // USER_ID
    passwordHash,   // PASSWORD_HASH
    "0",            // FAILED_LOGIN_COUNT
    "",             // RESET_TOKEN
    "",             // RESET_TOKEN_EXPIRY
  ]);
  console.log("✅  USER_AUTH row created.");

  console.log("\n🔑  Admin credentials seeded:");
  console.log(`    Email   : ${ADMIN_EMAIL}`);
  console.log(`    Password: ${ADMIN_PASSWORD}`);
  console.log("\n⚠️   Change the password after first login (SOP §16.2).");
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err.message ?? err);
  process.exit(1);
});
