/**
 * sheets.ts — Crystal Group Procurement System
 * All reads/writes go through this module.
 *
 * Changes from previous version:
 *  1. appendRowByFields now uses SHEET_SCHEMA as the column source in production,
 *     falling back to live header fetch only for unknown sheets.
 *  2. appendRowByFields warns (dev) or throws (prod) on unknown fields.
 *  3. writeAuditLog switched from fixed-order appendRow → appendRowByFields.
 *  4. deleteRowsWhere null-check bug fixed.
 */

import { google } from "googleapis";
import { getSheetColumns, getUnknownFields } from "./sheet-schema";

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
const IS_DEV = process.env.NODE_ENV !== "production";

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
  try {
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
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unable to parse range")) {
      console.warn(`[sheets] readSheet: Sheet/range "${sheetName}" not found. Returning empty array.`);
      return [];
    }
    throw error;
  }
}

/**
 * Appends a row using field-name -> value mapping.
 *
 * Column order is resolved from SHEET_SCHEMA (no live fetch needed for known sheets).
 * For unknown sheets it falls back to reading Row 1 from the live sheet.
 *
 * Validation:
 *  - In development: logs a warning for any field sent that has no matching column.
 *  - In production: throws an error so bad writes surface immediately.
 */
export async function appendRowByFields(
  sheetName: string,
  fields: Record<string, string | number | boolean | null>
): Promise<void> {
  const sheets = getSheetsClient();

  // Resolve headers from schema (fast) or live sheet (fallback)
  let headers: string[] = [];
  const schemaColumns = getSheetColumns(sheetName);

  if (schemaColumns) {
    headers = [...schemaColumns];
  } else {
    console.warn(`[sheets] "${sheetName}" is not in SHEET_SCHEMA — fetching headers live.`);
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!1:1`,
    });
    headers = (headerRes.data.values?.[0] ?? []) as string[];
  }

  // Validate: catch fields that have no column in the sheet
  const unknownFields = getUnknownFields(sheetName, fields);
  if (unknownFields.length > 0) {
    const msg = `[sheets] appendRowByFields: sheet "${sheetName}" has no column(s) for: ${unknownFields.join(", ")}. These values will be dropped.`;
    if (IS_DEV) {
      console.warn(msg);
    } else {
      throw new Error(msg);
    }
  }

  // Build the row in the correct column order
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

/** Appends a single row to a sheet. Values must match column order exactly.
 *  Prefer appendRowByFields for all new code. */
export async function appendRow(
  sheetName: string,
  values: (string | number | boolean | null)[]
): Promise<void> {
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

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return;

  const headers = rows[0] as string[];
  const matchColIndex = headers.indexOf(matchColumn);
  if (matchColIndex === -1) {
    console.warn(`[sheets] updateRowWhere: column "${matchColumn}" not found in sheet "${sheetName}"`);
    return;
  }

  const rowIndex = rows.findIndex((r, i) => i > 0 && r[matchColIndex] === matchValue);
  if (rowIndex === -1) {
    console.warn(`[sheets] updateRowWhere: no row found where ${matchColumn} = "${matchValue}" in "${sheetName}"`);
    return;
  }

  const updatedRow = [...rows[rowIndex]];
  Object.entries(updates).forEach(([col, val]) => {
    const colIdx = headers.indexOf(col);
    if (colIdx !== -1) {
      updatedRow[colIdx] = String(val);
    } else {
      console.warn(`[sheets] updateRowWhere: update column "${col}" not found in sheet "${sheetName}"`);
    }
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rowIndex + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [updatedRow] },
  });
}

/** Returns the next sequential number for a sheet (row count including header). */
export async function getNextSeq(sheetName: string): Promise<number> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:A`,
  });
  return Math.max((res.data.values?.length ?? 1), 1);
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

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets(properties(sheetId,title))",
  });
  const sheetMeta = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );

  // Fixed: previous code had `=== undefined` on a boolean which never triggered
  if (!sheetMeta?.properties?.sheetId) return;

  const sheetId = sheetMeta.properties.sheetId;

  const rowIndices: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i] as string[])[matchColIdx] === matchValue) rowIndices.push(i);
  }
  if (rowIndices.length === 0) return;

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

/**
 * Writes an audit log entry.
 * Uses appendRowByFields (safe against column reordering) instead of
 * the previous fixed-order appendRow array.
 */
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
  await appendRowByFields("AUDIT_LOG", {
    LOG_ID: generateId("LOG", seq),
    TIMESTAMP: new Date().toISOString(),
    USER_ID: params.userId,
    USER_NAME: params.userName ?? "",
    USER_ROLE: params.userRole ?? "",
    IP_ADDRESS: params.ipAddress ?? "",
    MODULE: params.module,
    RECORD_ID: params.recordId,
    ACTION: params.action,
    FIELD_CHANGED: params.fieldChanged ?? "",
    OLD_VALUE: params.oldValue ?? "",
    NEW_VALUE: params.newValue ?? "",
    REMARKS: params.remarks ?? "",
  });
}