/**
 * dump-schema.mjs
 * Reads Row 1 of every sheet in the Google Spreadsheet and prints
 * them formatted as SHEET_SCHEMA entries for lib/sheet-schema.ts.
 *
 * Run from procurement-web/:
 *   node --env-file=.env.local scripts/dump-schema.mjs
 */

import { google } from "googleapis";

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

if (!SPREADSHEET_ID) {
  console.error("❌  GOOGLE_SHEETS_SPREADSHEET_ID not set in .env.local");
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

// 1. Get list of all sheet names
const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
const sheetNames = meta.data.sheets.map((s) => s.properties.title);

console.log(`✅  Found ${sheetNames.length} sheets: ${sheetNames.join(", ")}\n`);
console.log("// ── Paste into lib/sheet-schema.ts ──────────────────────────────────────\n");

// 2. For each sheet, fetch only row 1
for (const name of sheetNames) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${name}!1:1`,
  });

  const headers = res.data.values?.[0] ?? [];
  if (headers.length === 0) {
    console.log(`    // ${name} — empty or no headers\n`);
    continue;
  }

  // Format as 4 per line, matching existing sheet-schema.ts style
  const lines = [];
  for (let i = 0; i < headers.length; i += 4) {
    const chunk = headers.slice(i, i + 4).map((h) => `"${h}"`).join(", ");
    lines.push(`        ${chunk},`);
  }

  const dashes = "─".repeat(Math.max(0, 58 - name.length));
  console.log(`    // ── ${name} ${dashes}`);
  console.log(`    ${name}: [`);
  lines.forEach((l) => console.log(l));
  console.log(`    ],\n`);
}
