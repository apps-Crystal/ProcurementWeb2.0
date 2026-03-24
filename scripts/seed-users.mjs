/**
 * Seed Dummy Users — Crystal Group Procurement System
 *
 * Creates one test account per role across different departments and sites.
 * Skips any user whose USER_ID or email already exists.
 *
 * Run once:
 *   node scripts/seed-users.mjs
 *
 * Password for all dummy accounts: Crystal@123
 * (Change after first login — SOP §16.2)
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
  console.error("❌  .env.local not found.");
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
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      val = val.replace(/\\n/g, "\n");
      return [key, val];
    })
);

const SPREADSHEET_ID = env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SA_EMAIL       = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY    = env.GOOGLE_PRIVATE_KEY;

if (!SPREADSHEET_ID || !SA_EMAIL || !PRIVATE_KEY) {
  console.error("❌  Missing Google Sheets env vars in .env.local");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dummy user definitions — one per role
// ─────────────────────────────────────────────────────────────────────────────

const PASSWORD = "Crystal@123";  // Must meet policy: upper + lower + digit + special + 8+

const DUMMY_USERS = [
  // ── System Admin ───────────────────────────────────────────────────────────
  {
    USER_ID:                    "USR-ADMIN-002",
    FULL_NAME:                  "Karan Malhotra",
    EMAIL:                      "karan.malhotra@crystalgroup.in",
    PHONE:                      "9876543200",
    DEPARTMENT:                 "IT",
    SITE:                       "HO",
    ROLE:                       "System_Admin",
    IS_PROCUREMENT_HEAD:        "Y",
    IS_FINANCE_HEAD:            "Y",
    IS_SITE_HEAD:               "Y",
    APPROVAL_SITES:             "HO,Mumbai,Noida,Pune",
    PAYMENT_APPROVAL_LIMIT_INR: "999999999",
  },

  // ── Requestor ──────────────────────────────────────────────────────────────
  {
    USER_ID:                    "USR-RQST-001",
    FULL_NAME:                  "Arjun Mehta",
    EMAIL:                      "arjun.mehta@crystalgroup.in",
    PHONE:                      "9876543201",
    DEPARTMENT:                 "Operations",
    SITE:                       "Mumbai",
    ROLE:                       "Requestor",
    IS_PROCUREMENT_HEAD:        "N",
    IS_FINANCE_HEAD:            "N",
    IS_SITE_HEAD:               "N",
    APPROVAL_SITES:             "Mumbai",
    PAYMENT_APPROVAL_LIMIT_INR: "0",
  },

  // ── Procurement Team ───────────────────────────────────────────────────────
  {
    USER_ID:                    "USR-PROC-001",
    FULL_NAME:                  "Priya Sharma",
    EMAIL:                      "priya.sharma@crystalgroup.in",
    PHONE:                      "9876543202",
    DEPARTMENT:                 "Procurement",
    SITE:                       "HO",
    ROLE:                       "Procurement_Team",
    IS_PROCUREMENT_HEAD:        "N",
    IS_FINANCE_HEAD:            "N",
    IS_SITE_HEAD:               "N",
    APPROVAL_SITES:             "HO,Mumbai,Noida",
    PAYMENT_APPROVAL_LIMIT_INR: "0",
  },

  // ── Procurement Head ───────────────────────────────────────────────────────
  {
    USER_ID:                    "USR-PRCH-001",
    FULL_NAME:                  "Vikram Joshi",
    EMAIL:                      "vikram.joshi@crystalgroup.in",
    PHONE:                      "9876543203",
    DEPARTMENT:                 "Procurement",
    SITE:                       "HO",
    ROLE:                       "Procurement_Head",
    IS_PROCUREMENT_HEAD:        "Y",
    IS_FINANCE_HEAD:            "N",
    IS_SITE_HEAD:               "N",
    APPROVAL_SITES:             "HO,Mumbai,Noida,Pune",
    PAYMENT_APPROVAL_LIMIT_INR: "5000000",
  },

  // ── Accounts ───────────────────────────────────────────────────────────────
  {
    USER_ID:                    "USR-ACCT-001",
    FULL_NAME:                  "Neha Gupta",
    EMAIL:                      "neha.gupta@crystalgroup.in",
    PHONE:                      "9876543204",
    DEPARTMENT:                 "Finance & Accounts",
    SITE:                       "HO",
    ROLE:                       "Accounts",
    IS_PROCUREMENT_HEAD:        "N",
    IS_FINANCE_HEAD:            "N",
    IS_SITE_HEAD:               "N",
    APPROVAL_SITES:             "HO",
    PAYMENT_APPROVAL_LIMIT_INR: "1000000",
  },

  // ── Finance ────────────────────────────────────────────────────────────────
  {
    USER_ID:                    "USR-FINC-001",
    FULL_NAME:                  "Sanjay Reddy",
    EMAIL:                      "sanjay.reddy@crystalgroup.in",
    PHONE:                      "9876543205",
    DEPARTMENT:                 "Finance & Accounts",
    SITE:                       "HO",
    ROLE:                       "Finance",
    IS_PROCUREMENT_HEAD:        "N",
    IS_FINANCE_HEAD:            "Y",
    IS_SITE_HEAD:               "N",
    APPROVAL_SITES:             "HO,Mumbai,Noida,Pune",
    PAYMENT_APPROVAL_LIMIT_INR: "10000000",
  },

  // ── Management ─────────────────────────────────────────────────────────────
  {
    USER_ID:                    "USR-MGMT-001",
    FULL_NAME:                  "Sunita Agarwal",
    EMAIL:                      "sunita.agarwal@crystalgroup.in",
    PHONE:                      "9876543206",
    DEPARTMENT:                 "Management",
    SITE:                       "HO",
    ROLE:                       "Management",
    IS_PROCUREMENT_HEAD:        "N",
    IS_FINANCE_HEAD:            "N",
    IS_SITE_HEAD:               "N",
    APPROVAL_SITES:             "HO,Mumbai,Noida,Pune",
    PAYMENT_APPROVAL_LIMIT_INR: "50000000",
  },

  // ── Warehouse ──────────────────────────────────────────────────────────────
  {
    USER_ID:                    "USR-WRHS-001",
    FULL_NAME:                  "Ravi Kumar",
    EMAIL:                      "ravi.kumar@crystalgroup.in",
    PHONE:                      "9876543207",
    DEPARTMENT:                 "Operations",
    SITE:                       "Noida",
    ROLE:                       "Warehouse",
    IS_PROCUREMENT_HEAD:        "N",
    IS_FINANCE_HEAD:            "N",
    IS_SITE_HEAD:               "N",
    APPROVAL_SITES:             "Noida",
    PAYMENT_APPROVAL_LIMIT_INR: "0",
  },

  // ── Site Head ──────────────────────────────────────────────────────────────
  {
    USER_ID:                    "USR-STHD-001",
    FULL_NAME:                  "Deepak Nair",
    EMAIL:                      "deepak.nair@crystalgroup.in",
    PHONE:                      "9876543208",
    DEPARTMENT:                 "Operations",
    SITE:                       "Noida",
    ROLE:                       "Site_Head",
    IS_PROCUREMENT_HEAD:        "N",
    IS_FINANCE_HEAD:            "N",
    IS_SITE_HEAD:               "Y",
    APPROVAL_SITES:             "Noida",
    PAYMENT_APPROVAL_LIMIT_INR: "500000",
  },

  // ── Designated Approver ────────────────────────────────────────────────────
  {
    USER_ID:                    "USR-DSGN-001",
    FULL_NAME:                  "Anjali Patel",
    EMAIL:                      "anjali.patel@crystalgroup.in",
    PHONE:                      "9876543209",
    DEPARTMENT:                 "Procurement",
    SITE:                       "Mumbai",
    ROLE:                       "Designated_Approver",
    IS_PROCUREMENT_HEAD:        "N",
    IS_FINANCE_HEAD:            "N",
    IS_SITE_HEAD:               "N",
    APPROVAL_SITES:             "Mumbai",
    PAYMENT_APPROVAL_LIMIT_INR: "2000000",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. Helpers
// ─────────────────────────────────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

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
// 4. Seed
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  const sheets = getSheets();
  const now    = new Date().toISOString();

  const existingUsers = await readSheet(sheets, "USERS");
  const existingAuth  = await readSheet(sheets, "USER_AUTH");

  const existingIds    = new Set(existingUsers.map((u) => u.USER_ID));
  const existingEmails = new Set(existingUsers.map((u) => (u.EMAIL ?? "").toLowerCase()));

  let created = 0;
  let skipped = 0;

  for (const u of DUMMY_USERS) {
    const emailLow = u.EMAIL.toLowerCase();

    if (existingIds.has(u.USER_ID) || existingEmails.has(emailLow)) {
      console.log(`⏭   Skipped ${u.ROLE.padEnd(20)} — ${u.EMAIL} already exists`);
      skipped++;
      continue;
    }

    // USERS row — column order must match sheet header row exactly
    await appendRow(sheets, "USERS", [
      u.USER_ID,
      u.FULL_NAME,
      u.EMAIL,
      u.PHONE,
      u.DEPARTMENT,
      u.SITE,
      u.ROLE,
      u.IS_PROCUREMENT_HEAD,
      u.IS_FINANCE_HEAD,
      u.IS_SITE_HEAD,
      u.APPROVAL_SITES,
      u.PAYMENT_APPROVAL_LIMIT_INR,
      "ACTIVE",         // STATUS
      "N",              // ACCOUNT_LOCKED
      "",               // LAST_LOGIN_DATE
      now,              // PASSWORD_LAST_CHANGED
      now,              // ACCESS_REQUEST_DATE
      "USR-ADMIN-001",  // PROVISIONED_BY
      now,              // PROVISIONED_DATE
      "USR-ADMIN-001",  // MANAGER_APPROVED_BY
      "",               // REVOCATION_DATE
      "",               // REVOCATION_REASON
      "USR-ADMIN-001",  // LAST_UPDATED_BY
      now,              // LAST_UPDATED_DATE
    ]);

    // USER_AUTH row
    const alreadyHasAuth = existingAuth.some((a) => a.USER_ID === u.USER_ID);
    if (!alreadyHasAuth) {
      await appendRow(sheets, "USER_AUTH", [
        u.USER_ID,
        hashPassword(PASSWORD),
        "0",  // FAILED_LOGIN_COUNT
        "",   // RESET_TOKEN
        "",   // RESET_TOKEN_EXPIRY
      ]);
    }

    console.log(`✅  Created  ${u.ROLE.padEnd(20)} — ${u.FULL_NAME} (${u.EMAIL})`);
    created++;
  }

  console.log(`\n📊  Done: ${created} created, ${skipped} skipped.`);

  if (created > 0) {
    console.log("\n🔑  All dummy accounts use password: Crystal@123");
    console.log("⚠️   Change passwords after first login (SOP §16.2).\n");
    console.log("  Role               │ Email");
    console.log("  ───────────────────┼─────────────────────────────────────");
    for (const u of DUMMY_USERS) {
      console.log(`  ${u.ROLE.padEnd(19)}│ ${u.EMAIL}`);
    }
  }
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err.message ?? err);
  process.exit(1);
});
