/**
 * dump_schema.js
 *
 * Run once from your project root:
 *   node dump_schema.js
 *
 * Connects to your live Google Sheet and prints every sheet's
 * Row 1 headers in the exact format needed for sheet-schema.ts.
 *
 * Copy-paste the output to patch your sheet-schema.ts.
 */

const { google } = require("googleapis");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env.local") });

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

async function dumpSchema() {
    console.log("Fetching headers from Google Sheets...\n");

    // Discover all sheet names dynamically
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const SHEET_NAMES = meta.data.sheets.map((s) => s.properties.title);
    console.log(`Found ${SHEET_NAMES.length} sheets: ${SHEET_NAMES.join(", ")}\n`);

    console.log("// ── PASTE THIS INTO src/lib/sheet-schema.ts ──────────────\n");
    console.log("export const SHEET_SCHEMA: Record<string, string[]> = {");

    for (const name of SHEET_NAMES) {
        try {
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${name}!1:1`,
            });
            const headers = res.data.values?.[0] ?? [];
            const formatted = headers.map((h) => `"${h}"`).join(", ");
            console.log(`\n  ${name}: [`);
            // Print in rows of 4 for readability
            for (let i = 0; i < headers.length; i += 4) {
                const chunk = headers.slice(i, i + 4).map((h) => `"${h}"`).join(", ");
                const comma = i + 4 < headers.length ? "," : "";
                console.log(`    ${chunk}${comma}`);
            }
            console.log(`  ],`);
        } catch (e) {
            console.log(`\n  // ⚠️  Could not fetch sheet "${name}": ${e.message}`);
            console.log(`  ${name}: [],`);
        }
    }

    console.log("\n};\n");
    console.log("// ── END OF DUMP ──────────────────────────────────────────");
}

dumpSchema();