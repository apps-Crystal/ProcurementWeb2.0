/**
 * One-off fix: patch PO-2603-0010 row in the PO sheet with correct financial data.
 * The row was written before the schema column-alignment fix, so SUBTOTAL, TOTAL_GST,
 * GRAND_TOTAL, and STATUS ended up in wrong columns.
 */
import { google } from 'googleapis';

const SPREADSHEET_ID = '1Pb_cGQQYSRQW1IpMEGX2rW2VGyoZAh794g41z-h5YIo';
const SHEET_NAME = 'PO';
const TARGET_PO_ID = 'PO-2603-0010';

// Correct values (calculated from MPR_LINES before GST)
// Refrigeration Compressor Oil: 10 * 850 * 1.18 = 10030
// Copper Pipe: 5 * 1200 * 1.18 = 7080
const CORRECT_SUBTOTAL   = 14500;
const CORRECT_TOTAL_GST  = 2610;
const CORRECT_GRAND_TOTAL = 17110;
const CORRECT_STATUS     = 'ISSUED';

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: 'procurement2-0@procurement2.iam.gserviceaccount.com',
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function main() {
  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Read the PO sheet to find PO-2603-0010's row number and header positions
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:BZ`,
  });

  const rows = res.data.values ?? [];
  const headers = rows[0];
  console.log('Headers (first 30):', headers.slice(0, 30));

  const poIdIdx       = headers.indexOf('PO_ID');
  const subtotalIdx   = headers.indexOf('SUBTOTAL');
  const totalGstIdx   = headers.indexOf('TOTAL_GST');
  const grandTotalIdx = headers.indexOf('GRAND_TOTAL');
  const statusIdx     = headers.indexOf('STATUS');

  console.log(`Indices — PO_ID:${poIdIdx} SUBTOTAL:${subtotalIdx} TOTAL_GST:${totalGstIdx} GRAND_TOTAL:${grandTotalIdx} STATUS:${statusIdx}`);

  // Find the target row
  const rowIdx = rows.findIndex((r) => r[poIdIdx] === TARGET_PO_ID);
  if (rowIdx < 0) { console.error('PO not found!'); process.exit(1); }
  const sheetRow = rowIdx + 1; // 1-indexed
  console.log(`Found ${TARGET_PO_ID} at sheet row ${sheetRow}`);
  console.log('Current SUBTOTAL:', rows[rowIdx][subtotalIdx], 'TOTAL_GST:', rows[rowIdx][totalGstIdx], 'GRAND_TOTAL:', rows[rowIdx][grandTotalIdx], 'STATUS:', rows[rowIdx][statusIdx]);

  // Helper: column index → A1 letter
  function colLetter(idx) {
    let letter = '';
    let n = idx + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      n = Math.floor((n - 1) / 26);
    }
    return letter;
  }

  // Build batch update data
  const updates = [
    { col: subtotalIdx,   val: CORRECT_SUBTOTAL },
    { col: totalGstIdx,   val: CORRECT_TOTAL_GST },
    { col: grandTotalIdx, val: CORRECT_GRAND_TOTAL },
    { col: statusIdx,     val: CORRECT_STATUS },
  ];

  const data = updates.map(({ col, val }) => ({
    range: `${SHEET_NAME}!${colLetter(col)}${sheetRow}`,
    values: [[val]],
  }));

  const updateRes = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });

  console.log('Updated cells:', updateRes.data.totalUpdatedCells);
  console.log('Done! PO-2603-0010 financial data patched.');
}

main().catch(console.error);
