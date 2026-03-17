
import { readSheet } from "./src/lib/sheets.js";

async function check() {
  try {
    const data = await readSheet("DROPDOWNS");
    console.log("DROPDOWNS data:", JSON.stringify(data.slice(0, 5), null, 2));
  } catch (e) {
    console.error("Error reading DROPDOWNS:", e);
  }
}

check();
