/**
 * Google Sheets utility — Crystal Group Procurement System
 * All reads/writes go through this module.
 */

import { google } from "googleapis";

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

// ─────────────────────────────────────────────────────────────────────────────
// ID GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export function generateId(prefix: string, seq: number): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${prefix}-${yy}${mm}-${String(seq).padStart(4, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC READ / WRITE
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all rows from a sheet as an array of objects keyed by header. */
export async function readSheet(sheetName: string): Promise<Record<string, string>[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  const headers = rows[0] as string[];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (row[i] as string) ?? "";
    });
    return obj;
  });
}

/** Appends a row using field-name → value mapping. Reads headers first so column order never matters. */
export async function appendRowByFields(
  sheetName: string,
  fields: Record<string, string | number | boolean | null>
): Promise<void> {
  const sheets = getSheetsClient();
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!1:1`,
  });
  const headers: string[] = (headerRes.data.values?.[0] ?? []) as string[];
  const row = headers.map((h) => {
    const val = fields[h];
    return val === null || val === undefined ? "" : val;
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

/** Appends a single row to a sheet. Values must match column order. */
export async function appendRow(sheetName: string, values: (string | number | boolean | null)[]): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/** Updates a specific row by finding the first column match. */
export async function updateRowWhere(
  sheetName: string,
  matchColumn: string,
  matchValue: string,
  updates: Record<string, string | number>
): Promise<void> {
  const sheets = getSheetsClient();

  // Get current data to find headers and row index
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return;

  const headers = rows[0] as string[];
  const matchColIndex = headers.indexOf(matchColumn);
  if (matchColIndex === -1) return;

  const rowIndex = rows.findIndex((r, i) => i > 0 && r[matchColIndex] === matchValue);
  if (rowIndex === -1) return;

  // Apply updates
  const updatedRow = [...rows[rowIndex]];
  Object.entries(updates).forEach(([col, val]) => {
    const colIdx = headers.indexOf(col);
    if (colIdx !== -1) updatedRow[colIdx] = String(val);
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rowIndex + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [updatedRow] },
  });
}

/** Returns the next sequential number for a sheet (row count - 1 header). */
export async function getNextSeq(sheetName: string): Promise<number> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:A`,
  });
  return Math.max((res.data.values?.length ?? 1), 1); // includes header
}

/** Deletes all rows in a sheet where a column matches a value. */
export async function deleteRowsWhere(
  sheetName: string,
  matchColumn: string,
  matchValue: string
): Promise<void> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return;

  const headers = rows[0] as string[];
  const matchColIdx = headers.indexOf(matchColumn);
  if (matchColIdx === -1) return;

  // Get numeric sheet ID
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets(properties(sheetId,title))",
  });
  const sheetMeta = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );
  if (!sheetMeta?.properties?.sheetId === undefined) return;
  const sheetId = sheetMeta!.properties!.sheetId!;

  // Collect matching row indices (1-based in Sheets = 0-based in values array)
  const rowIndices: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i] as string[])[matchColIdx] === matchValue) rowIndices.push(i);
  }
  if (rowIndices.length === 0) return;

  // Delete in reverse order so indices remain valid
  const requests = rowIndices.reverse().map((rowIdx) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS",
        startIndex: rowIdx,
        endIndex: rowIdx + 1,
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

export async function writeAuditLog(params: {
  userId: string;
  userName?: string;
  userRole?: string;
  ipAddress?: string;
  module: string;
  recordId: string;
  action: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  remarks?: string;
}): Promise<void> {
  const seq = await getNextSeq("AUDIT_LOG");
  await appendRow("AUDIT_LOG", [
    generateId("LOG", seq),
    new Date().toISOString(),
    params.userId,
    params.userName ?? "",
    params.userRole ?? "",
    params.ipAddress ?? "",
    params.module,
    params.recordId,
    params.action,
    params.fieldChanged ?? "",
    params.oldValue ?? "",
    params.newValue ?? "",
    params.remarks ?? "",
  ]);
}
