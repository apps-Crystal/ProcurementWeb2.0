
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

async function listSheets() {
  try {
    const res = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const titles = res.data.sheets.map(s => s.properties.title);
    console.log("Sheet Titles:", JSON.stringify(titles, null, 2));
  } catch (e) {
    console.error("Error:", e.message);
  }
}

listSheets();
