/**
 * Set test passwords for all non-admin users
 * Password: Test@2026
 * Run: node scripts/set-test-passwords.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.resolve(__dirname, "../.env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split("\n")
    .filter(l => l.trim() && !l.startsWith("#"))
    .map(l => {
      const idx = l.indexOf("="); const key = l.slice(0,idx).trim(); let val = l.slice(idx+1).trim();
      if ((val.startsWith('"')&&val.endsWith('"'))||(val.startsWith("'")&&val.endsWith("'"))) val=val.slice(1,-1);
      val = val.replace(/\\n/g,"\n"); return [key,val];
    })
);

const SPREADSHEET_ID = env.GOOGLE_SHEETS_SPREADSHEET_ID;
function getSheets() {
  const auth = new google.auth.GoogleAuth({ credentials:{ client_email:env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key:env.GOOGLE_PRIVATE_KEY }, scopes:["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version:"v4", auth });
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
async function readSheet(sheets, name) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId:SPREADSHEET_ID, range:name });
  const rows = res.data.values ?? []; if (rows.length<1) return [];
  const headers = rows[0];
  return rows.slice(1).map((row,i)=>{ const obj={}; headers.forEach((h,j)=>{ obj[h]=row[j]??""; }); obj.__rowIndex=i+2; return obj; });
}
async function updateCell(sheets, sheetName, rowIndex, colIndex, value) {
  const col = String.fromCharCode(65+colIndex);
  await sheets.spreadsheets.values.update({
    spreadsheetId:SPREADSHEET_ID, range:`${sheetName}!${col}${rowIndex}`,
    valueInputOption:"USER_ENTERED", requestBody:{ values:[[value]] }
  });
}

async function main() {
  const sheets = getSheets();
  const TEST_PASSWORD = "Test@2026";
  const hash = hashPassword(TEST_PASSWORD);

  // Read USER_AUTH
  const authRows = await readSheet(sheets, "USER_AUTH");
  const usersToUpdate = [
    "USR-2603-0003","USR-2603-0004","USR-2603-0005",
    "USR-2603-0006","USR-2603-0007","USR-2603-0008",
    "USR-2603-0009","USR-2603-0010","USR-2603-0011"
  ];

  // Get USER_AUTH headers
  const authRes = await sheets.spreadsheets.values.get({ spreadsheetId:SPREADSHEET_ID, range:"USER_AUTH!A1:Z1" });
  const authHeaders = authRes.data.values[0];
  const hashColIdx = authHeaders.indexOf("PASSWORD_HASH");
  const failColIdx = authHeaders.indexOf("FAILED_LOGIN_COUNT");

  let updated = 0;
  for (const userId of usersToUpdate) {
    const row = authRows.find(r => r.USER_ID === userId);
    if (!row) {
      // Insert new row
      await sheets.spreadsheets.values.append({
        spreadsheetId:SPREADSHEET_ID, range:"USER_AUTH!A1",
        valueInputOption:"USER_ENTERED",
        requestBody:{ values:[[userId, hashPassword(TEST_PASSWORD), "0","",""]] }
      });
      console.log(`✅ Created USER_AUTH for ${userId}`);
    } else {
      const newHash = hashPassword(TEST_PASSWORD);
      await updateCell(sheets, "USER_AUTH", row.__rowIndex, hashColIdx, newHash);
      await updateCell(sheets, "USER_AUTH", row.__rowIndex, failColIdx, "0");
      console.log(`✅ Updated password for ${userId} (${row.USER_ID})`);
    }
    updated++;
  }
  console.log(`\n✅ Done! ${updated} users updated.`);
  console.log(`\nTest password for all users: ${TEST_PASSWORD}`);
  console.log("\nUser map:");
  console.log("  USR-2603-0003 (rahitdhara.main@gmail.com)     → Procurement_Head");
  console.log("  USR-2603-0004 (amit.sharma@crystalgroup.in)   → Requestor (creates MPR)");
  console.log("  USR-2603-0005 (priya.nair@crystalgroup.in)    → Procurement_Team (Stage 1→2)");
  console.log("  USR-2603-0006 (suresh.patil@crystalgroup.in)  → Accounts (Stage 2→3)");
  console.log("  USR-2603-0007 (meera.joshi@crystalgroup.in)   → Finance (Stage 4→5)");
  console.log("  USR-2603-0008 (rajesh.kumar@crystalgroup.in)  → Management (Stage 3→4)");
  console.log("  USR-2603-0009 (dinesh.verma@crystalgroup.in)  → Warehouse (creates GRN)");
  console.log("  USR-2603-0010 (kiran.desai@crystalgroup.in)   → Site_Head (approves GRN)");
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
