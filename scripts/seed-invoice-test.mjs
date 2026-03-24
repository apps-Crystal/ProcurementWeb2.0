/**
 * seed-invoice-test.mjs
 *
 * Directly inserts a test invoice + invoice lines into Google Sheets
 * for the three-way match end-to-end test.
 *
 * PO: PO-2603-0016 | GRN: GRN-2603-0013
 * Invoice matches PO exactly → expected match outcome: MATCHED
 *
 * Run: node scripts/seed-invoice-test.mjs
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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
  console.error("❌  Missing Google Sheets credentials in .env.local");
  process.exit(1);
}

function getSheets() {
  const auth = new google.auth.JWT(SA_EMAIL, null, PRIVATE_KEY, ["https://www.googleapis.com/auth/spreadsheets"]);
  return google.sheets({ version: "v4", auth });
}

// Generate ID in format PREFIX-YYMM-XXXX
function generateId(prefix, seq) {
  const now  = new Date();
  const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, "0");
  return `${prefix}-${yymm}-${String(seq).padStart(4, "0")}`;
}

async function getSheetHeaders(sheets, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!1:1`,
  });
  return (res.data.values?.[0] ?? []);
}

async function getNextSeq(sheets, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:A`,
  });
  return Math.max(0, (res.data.values?.length ?? 1) - 1) + 1;
}

async function appendRowByFields(sheets, sheetName, data) {
  const headers = await getSheetHeaders(sheets, sheetName);
  const row = headers.map(h => {
    const val = data[h];
    return val === undefined || val === null ? "" : String(val);
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  console.log(`  ✅  Appended row to ${sheetName}: ${JSON.stringify(data).slice(0, 80)}...`);
}

async function main() {
  const sheets = getSheets();
  const now    = new Date().toISOString();
  const today  = now.slice(0, 10);

  // ── Invoice data (matches PO-2603-0016 exactly for MATCHED outcome) ─────────
  // PO Line 1: A4 Paper, 50 Pcs × ₹250, GST 12%  → taxable ₹12,500 | GST ₹1,500
  // PO Line 2: Ball Pen,  20 Box × ₹120, GST 12%  → taxable ₹2,400  | GST ₹288
  // Total taxable: ₹14,900 | Total GST: ₹1,788 | Total payable: ₹16,688

  const invSeq  = await getNextSeq(sheets, "INVOICES");
  const invId   = generateId("INV", invSeq);
  console.log(`\n📄  Creating invoice: ${invId}`);

  await appendRowByFields(sheets, "INVOICES", {
    INV_ID:               invId,
    INV_DATE:             today,
    INVOICE_NUMBER:       "INV-DEVA-2603-001",
    INVOICE_DATE:         "2026-03-19",
    VENDOR_NAME:          "Deva Enterprise",
    VENDOR_GSTIN:         "27AABCD1234E1Z5",
    PO_REF:               "PO-2603-0016",
    GRN_REF:              "GRN-2603-0013",
    TAXABLE_AMOUNT:       14900,
    TOTAL_GST:            1788,
    TOTAL_PAYABLE:        16688,
    AI_CONFIDENCE_SCORE:  95,
    AI_EXTRACTED:         "Y",
    INVOICE_PDF_URL:      "",
    STATUS:               "RECEIVED",
    UPLOADED_BY:          "USR-ADMIN-001",
    CREATED_AT:           now,
  });

  // ── Invoice lines ─────────────────────────────────────────────────────────
  console.log(`\n📋  Creating invoice lines...`);

  const line1Seq = await getNextSeq(sheets, "INVOICE_LINES");
  await appendRowByFields(sheets, "INVOICE_LINES", {
    LINE_ID:               generateId("INVL", line1Seq),
    INV_ID:                invId,
    LINE_NUMBER:           1,
    DESCRIPTION:           "A4 Paper Ream 500 sheets 80gsm White",
    HSN_SAC:               "4802",
    QTY:                   50,
    UNIT:                  "Pcs",
    RATE:                  250,
    GST_PERCENT:           12,
    LINE_AMOUNT:           14000,
    MATCHED_TO_PO_LINE_ID: "POL-2603-0039",
  });

  const line2Seq = await getNextSeq(sheets, "INVOICE_LINES");
  await appendRowByFields(sheets, "INVOICE_LINES", {
    LINE_ID:               generateId("INVL", line2Seq),
    INV_ID:                invId,
    LINE_NUMBER:           2,
    DESCRIPTION:           "Ball Point Pen Blue Medium Point",
    HSN_SAC:               "9608",
    QTY:                   20,
    UNIT:                  "Box",
    RATE:                  120,
    GST_PERCENT:           12,
    LINE_AMOUNT:           2688,
    MATCHED_TO_PO_LINE_ID: "POL-2603-0040",
  });

  console.log(`\n✅  Invoice ${invId} seeded successfully!`);
  console.log(`    PO: PO-2603-0016 | GRN: GRN-2603-0013`);
  console.log(`    Taxable: ₹14,900 | GST: ₹1,788 | Total: ₹16,688`);
  console.log(`    Expected match outcome: MATCHED (quantities and prices align with PO)`);
  console.log(`\n👉  Now run the three-way match via:`);
  console.log(`    POST /api/match with { po_id: "PO-2603-0016", grn_id: "GRN-2603-0013", inv_id: "${invId}" }`);
}

main().catch(e => { console.error("❌  Error:", e.message); process.exit(1); });
