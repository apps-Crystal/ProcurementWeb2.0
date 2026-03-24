#!/usr/bin/env node
/**
 * create-feedback-sheets.js
 * Creates FEEDBACK + FEEDBACK_COMMENTS sheets with Row 1 headers
 * Also adds FEEDBACK to SEQUENCES counter
 *
 * Usage:  cd procurement-web && node scripts/create-feedback-sheets.js
 */

require("dotenv").config({ path: ".env.local" });
const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ── HEADERS (must match what you add to sheet-schema.ts) ─────────────────────

const FEEDBACK_HEADERS = [
  "FEEDBACK_ID",
  "FEEDBACK_DATE",
  "TYPE",               // Bug | Feature_Request | UI_Issue | General
  "CATEGORY",           // PR | PO | GRN | Payments | Vendors | Invoices | Reports | Other
  "TITLE",
  "DESCRIPTION",
  "SCREENSHOT_1_URL",
  "SCREENSHOT_2_URL",
  "SCREENSHOT_3_URL",
  "SEVERITY",           // Critical | High | Medium | Low
  "BROWSER_INFO",
  "PAGE_URL",
  "REPORTED_BY_USER_ID",
  "REPORTED_BY_NAME",
  "REPORTED_BY_ROLE",
  "STATUS",             // Open | Acknowledged | In_Progress | Resolved | Closed | Wont_Fix
  "PRIORITY",           // P1 | P2 | P3 | P4
  "ASSIGNED_TO_USER_ID",
  "ASSIGNED_TO_NAME",
  "RESOLUTION_NOTES",
  "RESOLVED_DATE",
  "CREATED_DATE",
  "LAST_UPDATED_BY",
  "LAST_UPDATED_DATE",
];

const FEEDBACK_COMMENTS_HEADERS = [
  "COMMENT_ID",
  "FEEDBACK_ID",
  "COMMENT_DATE",
  "COMMENTED_BY_USER_ID",
  "COMMENTED_BY_NAME",
  "COMMENTED_BY_ROLE",
  "COMMENT_TEXT",
  "ATTACHMENT_URL",
  "IS_INTERNAL_NOTE",   // Y | N — internal notes visible only to Admin/Management
];

// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log("Target spreadsheet:", SPREADSHEET_ID);

  // 1. Create both sheets
  console.log("\n1. Creating sheets...");
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: "FEEDBACK",
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
          {
            addSheet: {
              properties: {
                title: "FEEDBACK_COMMENTS",
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      },
    });
    console.log("   ✓ FEEDBACK sheet created");
    console.log("   ✓ FEEDBACK_COMMENTS sheet created");
  } catch (e) {
    if (e.message?.includes("already exists")) {
      console.log("   ⚠ One or both sheets already exist — continuing with header write");
    } else {
      throw e;
    }
  }

  // 2. Write headers
  console.log("\n2. Writing Row 1 headers...");
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "FEEDBACK!A1",
    valueInputOption: "RAW",
    requestBody: { values: [FEEDBACK_HEADERS] },
  });
  console.log(`   ✓ FEEDBACK — ${FEEDBACK_HEADERS.length} columns`);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "FEEDBACK_COMMENTS!A1",
    valueInputOption: "RAW",
    requestBody: { values: [FEEDBACK_COMMENTS_HEADERS] },
  });
  console.log(`   ✓ FEEDBACK_COMMENTS — ${FEEDBACK_COMMENTS_HEADERS.length} columns`);

  // 3. Add FEEDBACK + FEEDBACK_COMMENTS to SEQUENCES counter
  console.log("\n3. Adding sequence counters...");
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "SEQUENCES!A1",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        ["FEEDBACK", "0"],
        ["FEEDBACK_COMMENTS", "0"],
      ],
    },
  });
  console.log("   ✓ SEQUENCES updated");

  // 4. Format header row (bold + freeze)
  console.log("\n4. Formatting headers...");
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties",
  });

  const sheetIds = {};
  spreadsheet.data.sheets.forEach((s) => {
    sheetIds[s.properties.title] = s.properties.sheetId;
  });

  const formatRequests = [];
  for (const name of ["FEEDBACK", "FEEDBACK_COMMENTS"]) {
    if (sheetIds[name] !== undefined) {
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: sheetIds[name],
            startRowIndex: 0,
            endRowIndex: 1,
          },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
            },
          },
          fields: "userEnteredFormat(textFormat,backgroundColor)",
        },
      });
    }
  }

  if (formatRequests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: formatRequests },
    });
    console.log("   ✓ Headers bolded + shaded");
  }

  console.log("\n══════════════════════════════════════");
  console.log("  DONE — Both sheets are ready");
  console.log("══════════════════════════════════════");
  console.log("\nNext: Add the schema to sheet-schema.ts and start building the module.");
}

run().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
