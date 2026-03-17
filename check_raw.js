
const { google } = require("googleapis");
require("dotenv").config();

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

async function check() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "DROPDOWNS",
    });
    console.log("DROPDOWNS Raw Rows:", JSON.stringify(res.data.values, null, 2));
  } catch (e) {
    console.error("Error:", e.message);
  }
}

check();
