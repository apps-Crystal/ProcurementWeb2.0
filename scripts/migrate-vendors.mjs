/**
 * Vendor Migration Script — Crystal Group Procurement System
 *
 * Reads the legacy vendors CSV and migrates all records into:
 *   - VENDORS sheet     (core vendor identity)
 *   - VENDOR_SUB_PROFILES sheet (bank + GST details)
 *
 * Bypasses API validations (PAN/GSTIN format, mandatory files) — safe for
 * bulk migration of existing onboarded vendors. Status = PENDING_KYC for all.
 *
 * Run from project root:
 *   node scripts/migrate-vendors.mjs
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load .env.local
// ─────────────────────────────────────────────────────────────────────────────

const envPath = path.resolve(__dirname, "../.env.local");
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

// ─────────────────────────────────────────────────────────────────────────────
// 2. Google Sheets client
// ─────────────────────────────────────────────────────────────────────────────

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: SA_EMAIL, private_key: PRIVATE_KEY },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/** Get row count of a sheet (including header) — used to calculate next seq. */
async function getRowCount(sheets, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:A`,
  });
  return Math.max((res.data.values?.length ?? 1), 1);
}

/** Read header row of a sheet to get column order. */
async function getHeaders(sheets, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!1:1`,
  });
  return (res.data.values?.[0] ?? []);
}

/** Batch-append multiple rows to a sheet. */
async function batchAppend(sheets, sheetName, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ID generation (matches generateId in sheets.ts)
// ─────────────────────────────────────────────────────────────────────────────

function generateId(prefix, seq) {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(-2);
  const mm  = String(now.getMonth() + 1).padStart(2, "0");
  return `${prefix}-${yy}${mm}-${String(seq).padStart(4, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GST state code → State name
// ─────────────────────────────────────────────────────────────────────────────

const GST_STATE = {
  "01":"Jammu & Kashmir","02":"Himachal Pradesh","03":"Punjab","04":"Chandigarh",
  "05":"Uttarakhand","06":"Haryana","07":"Delhi","08":"Rajasthan","09":"Uttar Pradesh",
  "10":"Bihar","11":"Sikkim","12":"Arunachal Pradesh","13":"Nagaland","14":"Manipur",
  "15":"Mizoram","16":"Tripura","17":"Meghalaya","18":"Assam","19":"West Bengal",
  "20":"Jharkhand","21":"Odisha","22":"Chhattisgarh","23":"Madhya Pradesh",
  "24":"Gujarat","25":"Daman & Diu","26":"Dadra & Nagar Haveli","27":"Maharashtra",
  "28":"Andhra Pradesh","29":"Karnataka","30":"Goa","31":"Lakshadweep","32":"Kerala",
  "33":"Tamil Nadu","34":"Puducherry","35":"Andaman & Nicobar","36":"Telangana",
  "37":"Andhra Pradesh","38":"Ladakh",
};

function stateFromGstin(gstin) {
  if (!gstin || gstin.length < 2) return "";
  return GST_STATE[gstin.slice(0, 2)] ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Address cleaning — strip JSON array format
// ─────────────────────────────────────────────────────────────────────────────

function cleanAddress(raw) {
  if (!raw) return "";
  let s = raw.trim();
  // Handle JSON array like ["line1", "line2"] or ['line1']
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      // Normalise single quotes → double quotes for JSON.parse
      const normalised = s.replace(/'/g, '"').replace(/\\\n/g, " ").replace(/\n/g, " ");
      const arr = JSON.parse(normalised);
      if (Array.isArray(arr)) {
        return arr.map((x) => String(x).replace(/\n/g, ", ").trim()).filter(Boolean).join("; ");
      }
    } catch {
      // fallback: strip brackets and outer quotes manually
      s = s.slice(1, -1).replace(/^["'\s]+|["'\s]+$/g, "");
    }
  }
  return s.replace(/\n/g, ", ").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Build column-ordered row array from a field map
// ─────────────────────────────────────────────────────────────────────────────

function buildRow(headers, fields) {
  return headers.map((h) => fields[h] ?? "");
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Main migration
// ─────────────────────────────────────────────────────────────────────────────

async function migrate() {
  const sheets = getSheets();
  const now    = new Date().toISOString();

  // ── Load pre-processed vendor data (JSON generated by Python CSV parser) ──
  const jsonPath = path.resolve(__dirname, "vendors_migration_data.json");
  const records  = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  console.log(`📂  Loaded ${records.length} vendor records from JSON.`);

  // ── Get current seq numbers ───────────────────────────────────────────────
  const venStartSeq = await getRowCount(sheets, "VENDORS");      // row count incl header
  const subStartSeq = await getRowCount(sheets, "VENDOR_SUB_PROFILES");
  console.log(`🔢  VENDORS starts at seq ${venStartSeq} → first ID: ${generateId("VEN", venStartSeq)}`);
  console.log(`🔢  VENDOR_SUB_PROFILES starts at seq ${subStartSeq} → first ID: ${generateId("SUB", subStartSeq)}`);

  // ── Get sheet headers (column order) ─────────────────────────────────────
  const venHeaders  = await getHeaders(sheets, "VENDORS");
  const subHeaders  = await getHeaders(sheets, "VENDOR_SUB_PROFILES");
  console.log(`📋  VENDORS columns (${venHeaders.length}):`, venHeaders.join(", "));
  console.log(`📋  VENDOR_SUB_PROFILES columns (${subHeaders.length}):`, subHeaders.join(", "));

  // ── Build rows ────────────────────────────────────────────────────────────
  const venRows = [];
  const subRows = [];
  const skipped = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];   // pre-processed fields from Python CSV parser

    const venSeq  = venStartSeq + i;
    const subSeq  = subStartSeq + i;
    const venId   = generateId("VEN", venSeq);
    const subId   = generateId("SUB", subSeq);
    const regDate = r.created_at ? (() => {
      // Parse DD/MM/YYYY HH:MM:SS → ISO
      const [datePart, timePart] = r.created_at.split(" ");
      if (datePart && datePart.includes("/")) {
        const [d, m, y] = datePart.split("/");
        return new Date(`${y}-${m}-${d}T${timePart || "00:00:00"}`).toISOString();
      }
      return new Date(r.created_at).toISOString();
    })() : now;

    const venFields = {
      VENDOR_ID:             venId,
      COMPANY_NAME:          r.company_name,
      VENDOR_TYPE:           "Supplier",
      CONTACT_PERSON:        r.contact_person,
      EMAIL:                 r.email,
      PHONE:                 r.phone,
      ADDRESS:               r.address,
      CITY:                  r.city,
      STATE:                 r.state,
      PAN:                   r.pan,
      IS_MSME:               r.is_msme,
      UDYAM_REG_NUMBER:      r.udyam,
      TDS_CATEGORY:          "Not Applicable",
      KYC_PAN_COPY_URL:      r.pan_card_url,
      KYC_MSME_CERT_URL:     r.is_msme === "Y" ? r.msme_cert_url : "",
      YEARS_IN_BUSINESS:     "",
      KEY_CLIENT_1:          "",
      KEY_CLIENT_2:          "",
      WORK_EXPERIENCE_NOTES: "",
      CAPACITY_SCALE:        "",
      REFERENCE_VERIFIED:    "N",
      STATUS:                "PENDING_KYC",
      DEACTIVATION_REASON:   "",
      REGISTERED_BY:         r.registered_by,
      REGISTERED_DATE:       regDate,
      APPROVED_BY:           "",
      APPROVED_DATE:         "",
      LAST_UPDATED_BY:       "MIGRATION",
      LAST_UPDATED_DATE:     now,
      REMARKS:               `Migrated from legacy system. Legacy ID: ${r.legacy_id}`,
    };

    const subFields = {
      SUB_PROFILE_ID:           subId,
      VENDOR_ID:                venId,
      SUB_PROFILE_LABEL:        "Primary",
      GSTIN:                    r.gstin,
      BILLING_ADDRESS:          r.address,
      BILLING_STATE:            r.state,
      BANK_NAME:                r.bank_name,
      ACCOUNT_NUMBER:           r.acc_number,
      IFSC_CODE:                r.ifsc_code,
      ACCOUNT_TYPE:             "Current",
      KYC_GST_CERT_URL:         r.gst_cert_url,
      KYC_CANCELLED_CHEQUE_URL: r.cheque_url,
      IS_PRIMARY:               "Y",
      STATUS:                   "PENDING_KYC",
      DEACTIVATION_REASON:      "",
      CREATED_BY:               r.registered_by,
      CREATED_DATE:             regDate,
      VERIFIED_BY:              "",
      VERIFIED_DATE:            "",
      LAST_UPDATED_BY:          "MIGRATION",
      LAST_UPDATED_DATE:        now,
      REMARKS:                  "",
    };

    venRows.push(buildRow(venHeaders, venFields));
    subRows.push(buildRow(subHeaders, subFields));

    if ((i + 1) % 25 === 0) console.log(`  ✔  Prepared ${i + 1}/${records.length} vendors...`);
  }

  console.log(`\n📤  Appending ${venRows.length} rows to VENDORS...`);
  // Batch in chunks of 50 to avoid API limits
  for (let i = 0; i < venRows.length; i += 50) {
    await batchAppend(sheets, "VENDORS", venRows.slice(i, i + 50));
    console.log(`    ↳ VENDORS batch ${Math.floor(i/50)+1} done (rows ${i+1}–${Math.min(i+50, venRows.length)})`);
  }

  console.log(`\n📤  Appending ${subRows.length} rows to VENDOR_SUB_PROFILES...`);
  for (let i = 0; i < subRows.length; i += 50) {
    await batchAppend(sheets, "VENDOR_SUB_PROFILES", subRows.slice(i, i + 50));
    console.log(`    ↳ VENDOR_SUB_PROFILES batch ${Math.floor(i/50)+1} done (rows ${i+1}–${Math.min(i+50, subRows.length)})`);
  }

  console.log(`\n✅  Migration complete!`);
  console.log(`    VENDORS:              ${venRows.length} rows added (IDs: ${generateId("VEN", venStartSeq)} → ${generateId("VEN", venStartSeq + venRows.length - 1)})`);
  console.log(`    VENDOR_SUB_PROFILES:  ${subRows.length} rows added (IDs: ${generateId("SUB", subStartSeq)} → ${generateId("SUB", subStartSeq + subRows.length - 1)})`);
  if (skipped.length) console.log(`    Skipped: ${skipped.length}`, skipped);
}

migrate().catch((err) => {
  console.error("❌  Migration failed:", err.message ?? err);
  process.exit(1);
});
