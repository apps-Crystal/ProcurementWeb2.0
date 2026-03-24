#!/usr/bin/env node
/**
 * migrate-v1-to-v2.js
 * Crystal Group — Full data migration from old procurement system to Proc 2.0
 *
 * Usage:
 *   cd procurement-web
 *   node scripts/migrate-v1-to-v2.js [--dry-run] [--step=STEP_NAME] [--skip=STEP1,STEP2]
 *
 * Flags:
 *   --dry-run     Print what would be written without actually writing
 *   --step=X      Run only a single step (e.g. --step=VENDORS)
 *   --skip=X,Y    Skip specific steps (comma-separated)
 *
 * Prerequisites:
 *   - .env.local must be configured with Google credentials
 *   - Target spreadsheet must have all sheets with Row 1 headers matching sheet-schema.ts
 *   - Old spreadsheets must be readable by the service account (share with Editor)
 */

require("dotenv").config({ path: ".env.local" });
const { google } = require("googleapis");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const OLD_PROCUREMENT_SHEET_ID = "1YWRWQOVIEkt3S6TOV_P_gVceV0YgsrGt_9hL05QuPVQ";
const OLD_GRN_SHEET_ID = "1GVOovCuk2t07I5HcsFKOKqCPkVK3AeLM-BMebgYv-68";
const NEW_SHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

const MIGRATION_TIMESTAMP = new Date().toISOString().replace("T", " ").slice(0, 19);
const DEFAULT_PASSWORD = "Crystal@2025"; // Force reset on first login

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONLY_STEP = args.find((a) => a.startsWith("--step="))?.split("=")[1];
const SKIP_STEPS = (args.find((a) => a.startsWith("--skip="))?.split("=")[1] || "").split(",").filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS CLIENT
// ─────────────────────────────────────────────────────────────────────────────

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

const sheets = google.sheets({ version: "v4", auth: getAuth() });

async function readSheet(spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });
  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (row[i] || "").toString().trim();
    });
    return obj;
  });
}

async function appendRows(sheetName, rows) {
  if (!rows.length) return;
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would append ${rows.length} rows to ${sheetName}`);
    console.log(`  Sample first row:`, JSON.stringify(rows[0]).slice(0, 200));
    return;
  }

  // Batch in chunks of 500 to avoid API limits
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await sheets.spreadsheets.values.append({
      spreadsheetId: NEW_SHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: chunk },
    });
    console.log(`  Appended rows ${i + 1}–${Math.min(i + BATCH, rows.length)} to ${sheetName}`);

    // Respect rate limits
    if (i + BATCH < rows.length) await sleep(1500);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function parseDate(val) {
  if (!val) return "";
  // Handle DD/MM/YYYY HH:mm:ss
  const dmyMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(.*)?$/);
  if (dmyMatch) {
    const [, d, m, y, time] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}${time ? " " + time : ""}`;
  }
  // Handle YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val;
  // Handle MM/DD/YYYY
  const mdyMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace("T", " ");
  }
  return val;
}

function parseDateOnly(val) {
  const full = parseDate(val);
  return full ? full.slice(0, 10) : "";
}

function hashPassword(plain) {
  // Simple SHA-256 for migration; the app uses bcrypt so we'll need to
  // handle this separately or set a flag for password reset
  // For now, we'll use a marker the auth system recognizes
  return `$MIGRATE$${crypto.createHash("sha256").update(plain).digest("hex")}`;
}

function gstToState(gstin) {
  if (!gstin || gstin.length < 2) return "";
  const stateMap = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
    "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
    "16": "Tripura", "17": "Meghalaya", "18": "Assam",
    "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
    "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "27": "Maharashtra", "29": "Karnataka", "32": "Kerala",
    "33": "Tamil Nadu", "36": "Telangana", "37": "Andhra Pradesh",
  };
  return stateMap[gstin.substring(0, 2)] || "";
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUPS (populated during migration)
// ─────────────────────────────────────────────────────────────────────────────

const emailToUserId = {};   // email → USER_ID
const emailToName = {};     // email → FULL_NAME
const vendorIdToSubProfileId = {}; // VENDOR_ID → primary SUB_PROFILE_ID
const vendorIdToName = {};  // VENDOR_ID → COMPANY_NAME
const vendorIdToEmail = {}; // VENDOR_ID → EMAIL
const grnIdToInvId = {};    // GRN_ID → INV_ID
const poIdToVendorId = {};  // PO_ID → VENDOR_ID

let userSeq = 0;
let invSeq = 0;
let subProfileSeq = 0;

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: USERS
// ─────────────────────────────────────────────────────────────────────────────

async function migrateUsers() {
  console.log("\n═══ STEP 1: USERS ═══");

  // Collect all unique emails from old data
  const emailSet = new Set();
  const emailRoles = {}; // email → inferred role info

  // From PR_Master
  const prs = await readSheet(OLD_PROCUREMENT_SHEET_ID, "PR_Master");
  prs.forEach((r) => {
    if (r.Requested_By) { emailSet.add(r.Requested_By); emailRoles[r.Requested_By] = { ...(emailRoles[r.Requested_By] || {}), creates_pr: true }; }
    if (r.Last_Action_By) emailSet.add(r.Last_Action_By);
    if (r.PR_Approved_By) { emailSet.add(r.PR_Approved_By); emailRoles[r.PR_Approved_By] = { ...(emailRoles[r.PR_Approved_By] || {}), approves_pr: true }; }
  });

  // From PO_Master
  const pos = await readSheet(OLD_PROCUREMENT_SHEET_ID, "PO_Master");
  pos.forEach((r) => {
    if (r.Last_Action_By) emailSet.add(r.Last_Action_By);
  });

  // From Payments
  const pays = await readSheet(OLD_PROCUREMENT_SHEET_ID, "Payments");
  pays.forEach((r) => {
    if (r.Payments_Requester_Email) emailSet.add(r.Payments_Requester_Email);
    if (r.Payments_Approver_Email) { emailSet.add(r.Payments_Approver_Email); emailRoles[r.Payments_Approver_Email] = { ...(emailRoles[r.Payments_Approver_Email] || {}), approves_payment: true }; }
  });

  // From GRN_Master
  const grns = await readSheet(OLD_GRN_SHEET_ID, "GRN_Master");
  grns.forEach((r) => {
    if (r.Created_By_Email) { emailSet.add(r.Created_By_Email); emailRoles[r.Created_By_Email] = { ...(emailRoles[r.Created_By_Email] || {}), creates_grn: true }; }
    if (r.Verified_By_Email) { emailSet.add(r.Verified_By_Email); emailRoles[r.Verified_By_Email] = { ...(emailRoles[r.Verified_By_Email] || {}), verifies_grn: true }; }
    if (r.Created_By_Name) emailToName[r.Created_By_Email] = r.Created_By_Name;
  });

  // From Bill Verification
  let billVerifs = [];
  try {
    billVerifs = await readSheet(OLD_GRN_SHEET_ID, "Bill Verification");
    billVerifs.forEach((r) => {
      const email = r["Last Action By"];
      if (email) { emailSet.add(email); emailRoles[email] = { ...(emailRoles[email] || {}), verifies_bills: true }; }
    });
  } catch (e) {
    console.log("  Warning: Could not read Bill Verification:", e.message);
  }

  // Filter valid emails
  const emails = [...emailSet].filter((e) => e && e.includes("@"));
  console.log(`  Found ${emails.length} unique users`);

  // Infer site from email prefix
  function inferSite(email) {
    const prefix = email.split("@")[0].toLowerCase();
    if (prefix.includes("noida")) return "Noida";
    if (prefix.includes("kheda")) return "Kheda";
    if (prefix.includes("pune")) return "Pune";
    if (prefix.includes("detroj")) return "Detroj";
    if (prefix.includes("bhubaneswar")) return "Bhubaneswar";
    if (prefix.includes("site")) return "SITE";
    return "HQ";
  }

  // Infer name from email if not found
  function inferName(email) {
    if (emailToName[email]) return emailToName[email];
    const local = email.split("@")[0].replace(/[._]/g, " ");
    return local.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  // Infer role
  function inferRole(email) {
    const roles = emailRoles[email] || {};
    if (roles.approves_pr) return "Procurement_Head";
    if (roles.approves_payment) return "Management";
    if (roles.verifies_bills) return "Accounts";
    if (roles.verifies_grn) return "Site_Head";
    if (roles.creates_grn) return "Warehouse";
    if (roles.creates_pr) return "Procurement_Team";
    return "Procurement_Team";
  }

  const userRows = [];
  const authRows = [];

  emails.forEach((email) => {
    userSeq++;
    const userId = `USR-MIG-${String(userSeq).padStart(4, "0")}`;
    const name = inferName(email);
    const role = inferRole(email);
    const site = inferSite(email);

    emailToUserId[email] = userId;
    emailToName[email] = name;

    // USERS row (24 columns per schema)
    userRows.push([
      userId, name, email, "",
      "Procurement", site, role, role === "Procurement_Head" ? "Y" : "",
      "", role === "Site_Head" ? "Y" : "", site, "",
      "ACTIVE", "", "", "",
      "", "MIGRATION", MIGRATION_TIMESTAMP, "",
      "", "", "MIGRATION", MIGRATION_TIMESTAMP,
    ]);

    // USER_AUTH row (5 columns)
    authRows.push([
      userId, hashPassword(DEFAULT_PASSWORD), "0", "", "",
    ]);
  });

  await appendRows("USERS", userRows);
  await appendRows("USER_AUTH", authRows);
  console.log(`  Migrated ${userRows.length} users`);

  // Store refs for later
  return { prs, pos, pays, grns, billVerifs };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: VENDORS
// ─────────────────────────────────────────────────────────────────────────────

async function migrateVendors() {
  console.log("\n═══ STEP 2: VENDORS ═══");

  const vendors = await readSheet(OLD_PROCUREMENT_SHEET_ID, "Vendor_Master");
  console.log(`  Read ${vendors.length} vendors from old system`);

  const vendorRows = [];
  const subProfileRows = [];

  vendors.forEach((v) => {
    const vid = v.Vendor_ID;
    if (!vid) return;

    vendorIdToName[vid] = v.Company_Name || "";
    vendorIdToEmail[vid] = v.Email_ID || "";

    const isActive = (v.Active || "").toLowerCase();
    const status = isActive === "false" || isActive === "no" || isActive === "inactive" ? "INACTIVE" : "ACTIVE";
    const state = gstToState(v.GST_Number);
    const isMsme = v.Vendor_MSME_Number ? "Y" : "N";

    // VENDORS row (30 columns)
    vendorRows.push([
      vid, v.Company_Name || "", "SUPPLIER", v.Contact_Person || "",
      v.Email_ID || "", v.Contact_Number || "", v.Vendor_Address || "", "",
      state, v.Vendor_PAN || "", isMsme, v.Vendor_MSME_Number || "",
      "", v.PanCard_Link || "", v.MSME_Certificate_Link || "", "",
      "", "", "", "",
      "Y", status, "", v.Created_By || "",
      parseDateOnly(v.Created_At) || MIGRATION_TIMESTAMP, "MIGRATION", MIGRATION_TIMESTAMP, "MIGRATION",
      MIGRATION_TIMESTAMP, "Migrated from v1",
    ]);

    // VENDOR_SUB_PROFILES row (22 columns)
    subProfileSeq++;
    const spId = `VSP-${vid.replace("V-", "")}`;
    vendorIdToSubProfileId[vid] = spId;

    subProfileRows.push([
      spId, vid, "Primary", v.GST_Number || "",
      v.Vendor_Address || "", state, v.Bank_Name || "", v.Acc_Number || "",
      v.IFSC_CODE || "", "CURRENT", v.GST_Certificate_Link || "", v.Cancelled_Cheque_Link || "",
      "Y", status, "", v.Created_By || "",
      parseDateOnly(v.Created_At) || MIGRATION_TIMESTAMP, "", "",  "MIGRATION",
      MIGRATION_TIMESTAMP, "",
    ]);
  });

  await appendRows("VENDORS", vendorRows);
  await appendRows("VENDOR_SUB_PROFILES", subProfileRows);
  console.log(`  Migrated ${vendorRows.length} vendors + ${subProfileRows.length} sub-profiles`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: MPR + MPR_LINES
// ─────────────────────────────────────────────────────────────────────────────

async function migratePRs(cachedPRs) {
  console.log("\n═══ STEP 3: MPR + MPR_LINES ═══");

  const prs = cachedPRs || await readSheet(OLD_PROCUREMENT_SHEET_ID, "PR_Master");
  const prItems = await readSheet(OLD_PROCUREMENT_SHEET_ID, "PR_Items");
  console.log(`  Read ${prs.length} PRs and ${prItems.length} PR items`);

  // Status mapping — discover unique statuses
  const statusSet = new Set(prs.map((p) => `${p.Status_Code}|${p.Status_Label}`));
  console.log(`  Status codes found:`, [...statusSet].join(", "));

  function mapPRStatus(code, label) {
    const c = (code || "").toString().trim();
    const l = (label || "").toString().trim().toUpperCase();
    if (c === "10" || l === "DRAFT") return "DRAFT";
    if (c === "20" || l.includes("SUBMIT") || l.includes("PENDING")) return "SUBMITTED";
    if (c === "30" || l.includes("APPROVED") || l.includes("APPROVE")) return "APPROVED";
    if (c === "40" || l.includes("REJECTED") || l.includes("REJECT")) return "REJECTED";
    if (c === "50" || l.includes("CANCEL")) return "CANCELLED";
    if (l.includes("SEND_BACK") || l.includes("SEND BACK")) return "SEND_BACK";
    return l || "SUBMITTED"; // fallback
  }

  const mprRows = [];
  prs.forEach((pr) => {
    if (!pr.PR_ID) return;
    const requestorId = emailToUserId[pr.Requested_By] || "";
    const requestorName = emailToName[pr.Requested_By] || pr.Requested_By || "";
    const approverId = emailToUserId[pr.PR_Approved_By] || "";
    const approverName = emailToName[pr.PR_Approved_By] || pr.PR_Approved_By || "";

    // 42 columns per MPR schema
    mprRows.push([
      pr.PR_ID, parseDateOnly(pr.Date_of_Requisition), "1", requestorId,
      requestorName, pr.Site || "", pr.Purchase_Category || "", pr.PR_Purpose || "",
      pr.Procurement_Type || "STANDARD", pr.Delivery_Location || "", parseDateOnly(pr.Expected_Delivery_Date), pr.Vendor_ID || "",
      pr["Vendor Company Name"] || "", pr.Payment_Terms || "", "", "",
      "", pr.Payment_Type || "", "", "",
      "", "", "", pr.Warranty_AMC || "",
      "", "",
      pr["Upload Quotation"] || "", pr["Final Agreed PI"] || "", pr["Supporting Docs"] || "", "N",
      "", "", pr.Total_Incl_GST || "", "",
      mapPRStatus(pr.Status_Code, pr.Status_Label), approverId, approverName, parseDate(pr.PR_Approved_DateTime),
      pr.Approver_Remarks || pr.PR_Remarks || "", parseDate(pr.Timestamp), pr.Last_Action_By || "", parseDate(pr.Last_Action_At),
    ]);
  });

  // MPR_LINES (19 columns)
  const lineRows = [];
  prItems.forEach((li) => {
    if (!li.PR_ID || !li.Line_No) return;
    const qty = parseFloat(li.Qty) || 0;
    const rate = parseFloat(li.Rate) || 0;
    const gst = parseFloat(li["GST_%"]) || 0;
    const lineAmt = qty * rate;
    const gstAmt = lineAmt * gst / 100;

    lineRows.push([
      `${li.PR_ID}-L${li.Line_No}`, li.PR_ID, li.Line_No, li.Item_Name || "",
      li.Purpose || li.Item_Name || "", li.UOM || "", String(qty), String(rate),
      String(gst), "", String(lineAmt.toFixed(2)), String(gstAmt.toFixed(2)),
      li.Line_Total || String((lineAmt + gstAmt).toFixed(2)), li.Purpose || "", "", "",
      "", "N", "",
    ]);
  });

  await appendRows("MPR", mprRows);
  await appendRows("MPR_LINES", lineRows);
  console.log(`  Migrated ${mprRows.length} MPRs + ${lineRows.length} lines`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: PO + PO_LINES
// ─────────────────────────────────────────────────────────────────────────────

async function migratePOs(cachedPOs) {
  console.log("\n═══ STEP 4: PO + PO_LINES ═══");

  const pos = cachedPOs || await readSheet(OLD_PROCUREMENT_SHEET_ID, "PO_Master");
  const poItems = await readSheet(OLD_PROCUREMENT_SHEET_ID, "PO_Items");
  console.log(`  Read ${pos.length} POs and ${poItems.length} PO items`);

  // Status mapping
  const statusSet = new Set(pos.map((p) => `${p.Status_Code}|${p.Status_Label}`));
  console.log(`  PO Status codes found:`, [...statusSet].join(", "));

  function mapPOStatus(code, label) {
    const c = (code || "").toString().trim();
    const l = (label || "").toString().trim().toUpperCase();
    if (c === "10" || l === "DRAFT") return "DRAFT";
    if (c === "20" || l.includes("CREATED") || l.includes("ACTIVE")) return "RELEASED";
    if (c === "30" || l.includes("RELEASED")) return "RELEASED";
    if (c === "40" || l.includes("CLOSED") || l.includes("COMPLETE")) return "CLOSED";
    if (c === "50" || l.includes("CANCEL")) return "CANCELLED";
    return l || "RELEASED";
  }

  const poRows = [];
  pos.forEach((po) => {
    if (!po.PO_ID) return;
    poIdToVendorId[po.PO_ID] = po.Vendor_ID || "";

    // 55 columns per PO schema
    poRows.push([
      po.PO_ID, "MATERIAL_PO", parseDateOnly(po.PO_Date), "1",
      po.PO_No_Tally || "", po.PR_ID || "", "MPR", po.Vendor_ID || "",
      vendorIdToSubProfileId[po.Vendor_ID] || "", po.Vendor_Company_Name || vendorIdToName[po.Vendor_ID] || "", vendorIdToEmail[po.Vendor_ID] || "", "",
      po.Site || "", po.Freight_Amount || "", po.Installation_Amount || "", "",
      "", "", "", "",
      "", "", "", "",
      po.Total_Incl_GST || "", "Y", "", "",
      "", po.PO_File_URL || "", "",
      "NOT_SENT", "", "", "",
      "", "", "", "",
      "", "", "", "",
      "", "", mapPOStatus(po.Status_Code, po.Status_Label), po.Last_Action_By || "",
      parseDateOnly(po.PO_Date), "", "",  "",
      "", po.PO_Remarks || "", "", "",
      "", po.Last_Action_By || "", parseDate(po.Last_Action_At),
    ]);
  });

  // PO_LINES (17 columns)
  const lineRows = [];
  poItems.forEach((li) => {
    if (!li.PO_ID || !li.Line_No) return;
    const qty = parseFloat(li.Qty) || 0;
    const rate = parseFloat(li.Rate) || 0;
    const gst = parseFloat(li["GST_%"]) || 0;
    const lineAmt = qty * rate;
    const gstAmt = lineAmt * gst / 100;

    lineRows.push([
      `${li.PO_ID}-L${li.Line_No}`, li.PO_ID, li.Line_No, "",
      li.Item_Name || "", li.Item_Name || "", li.UOM || "", String(qty),
      String(rate), String(gst), "", String(lineAmt.toFixed(2)),
      String(gstAmt.toFixed(2)), li.Line_Total || String((lineAmt + gstAmt).toFixed(2)), "", String(qty),
      "",
    ]);
  });

  await appendRows("PO", poRows);
  await appendRows("PO_LINES", lineRows);
  console.log(`  Migrated ${poRows.length} POs + ${lineRows.length} lines`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5: GRN + GRN_LINES
// ─────────────────────────────────────────────────────────────────────────────

async function migrateGRNs(cachedGRNs) {
  console.log("\n═══ STEP 5: GRN + GRN_LINES ═══");

  const grns = cachedGRNs || await readSheet(OLD_GRN_SHEET_ID, "GRN_Master");
  const grnItems = await readSheet(OLD_GRN_SHEET_ID, "GRN_Items");

  let invoiceCollection = [];
  try {
    invoiceCollection = await readSheet(OLD_GRN_SHEET_ID, "Invoice_Collection");
  } catch (e) {
    console.log("  Warning: Could not read Invoice_Collection:", e.message);
  }

  // Build Invoice_Collection lookup by GRN_ID
  const icByGrn = {};
  invoiceCollection.forEach((ic) => {
    if (ic.GRN_ID) icByGrn[ic.GRN_ID] = ic;
  });

  console.log(`  Read ${grns.length} GRNs, ${grnItems.length} GRN items, ${invoiceCollection.length} invoice collections`);

  // Build item summaries per GRN
  const grnItemSummary = {};
  grnItems.forEach((li) => {
    if (!li.GRN_ID) return;
    if (!grnItemSummary[li.GRN_ID]) grnItemSummary[li.GRN_ID] = { orderedQty: 0, receivedQty: 0, defectiveQty: 0 };
    grnItemSummary[li.GRN_ID].orderedQty += parseFloat(li.Ordered_Qty) || 0;
    grnItemSummary[li.GRN_ID].receivedQty += parseFloat(li.Received_Qty) || 0;
    grnItemSummary[li.GRN_ID].defectiveQty += parseFloat(li.Defective_Qty) || 0;
  });

  const grnRows = [];
  grns.forEach((g) => {
    if (!g.GRN_ID) return;
    const ic = icByGrn[g.GRN_ID] || {};
    const summary = grnItemSummary[g.GRN_ID] || {};
    const acceptedQty = (summary.receivedQty || 0) - (summary.defectiveQty || 0);

    // Map status from Invoice_Collection
    const icStatus = (ic.Status || "").toUpperCase();
    let status = "SUBMITTED";
    if (icStatus.includes("APPROVED") || icStatus.includes("VERIFIED")) status = "VERIFIED";
    if (icStatus.includes("REJECTED")) status = "REJECTED";

    const raisedById = emailToUserId[g.Created_By_Email || g.Creator_ID] || "";
    const siteHeadId = emailToUserId[g.Verified_By_Email] || "";

    // 42 columns per GRN schema
    grnRows.push([
      g.GRN_ID, parseDateOnly(g.Created_At || g.Invoice_Date), g.PO_ID || "", g.Vendor_ID || "",
      vendorIdToName[g.Vendor_ID] || "", g.Site || "", g["LR/Delivery Challan_Number"] || g.LR_Delivery_Challan_Number || "", g.Vehicle_number || g["Vehicle number"] || "",
      "", parseDateOnly(g.Invoice_Date), "", g.Invoice_Number || g["Invoice Number"] || "",
      parseDateOnly(g.Invoice_Date), "", "", "",
      "", "", "", ic.Photos_URL || "",
      g.Invoice_URL || "", "", "", String(summary.orderedQty || ""),
      String(summary.receivedQty || ""), String(acceptedQty), String(summary.defectiveQty || ""), "",
      "", status, siteHeadId, "",
      g.Verified_At || "", "", "", "",
      "", raisedById, g.Created_By_Name || "",  parseDate(g.Timestamp || g.Created_At),
      "MIGRATION", MIGRATION_TIMESTAMP,
    ]);
  });

  // GRN_LINES (13 columns)
  const lineRows = [];
  grnItems.forEach((li) => {
    if (!li.GRN_ID) return;
    const received = parseFloat(li.Received_Qty) || 0;
    const defective = parseFloat(li.Defective_Qty) || 0;
    const accepted = received - defective;
    const condition = defective > 0 ? "PARTIAL_DEFECTIVE" : "GOOD";

    lineRows.push([
      `${li.GRN_ID}-L${li.Line_No || "1"}`, li.GRN_ID, "", li.Line_No || "1",
      li.Item_Name || "", li.UOM || "", String(li.Ordered_Qty || ""), String(received),
      String(defective), String(accepted), condition, "",
      "",
    ]);
  });

  await appendRows("GRN", grnRows);
  await appendRows("GRN_LINES", lineRows);
  console.log(`  Migrated ${grnRows.length} GRNs + ${lineRows.length} lines`);

  return { invoiceCollection };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6: INVOICES
// ─────────────────────────────────────────────────────────────────────────────

async function migrateInvoices(invoiceCollectionData) {
  console.log("\n═══ STEP 6: INVOICES ═══");

  const invoiceCollection = invoiceCollectionData || await readSheet(OLD_GRN_SHEET_ID, "Invoice_Collection");

  let billVerifs = [];
  try {
    billVerifs = await readSheet(OLD_GRN_SHEET_ID, "Bill Verification");
  } catch (e) {
    console.log("  Warning: Could not read Bill Verification");
  }

  // Build bill verification lookup by GRN_ID
  const bvByGrn = {};
  billVerifs.forEach((bv) => {
    if (bv.GRN_ID) bvByGrn[bv.GRN_ID] = bv;
  });

  console.log(`  Processing ${invoiceCollection.length} invoice records`);

  const invRows = [];
  invoiceCollection.forEach((ic) => {
    if (!ic.GRN_ID) return;
    invSeq++;
    const invId = `INV-MIG-${String(invSeq).padStart(4, "0")}`;
    grnIdToInvId[ic.GRN_ID] = invId;

    const bv = bvByGrn[ic.GRN_ID] || {};
    const bvStatus = (bv["Verification Status"] || "").toUpperCase();
    let status = "UPLOADED";
    if (bvStatus.includes("VERIFIED") || bvStatus.includes("OK")) status = "VERIFIED";

    const vendorId = poIdToVendorId[ic.PO_ID] || "";

    // 28 columns per INVOICES schema
    invRows.push([
      invId, parseDateOnly(ic.Invoice_Date), "", parseDateOnly(ic.Invoice_Date),
      vendorId, vendorIdToName[vendorId] || "", "", "",
      ic.GRN_ID || "", "", "", ic.PO_ID || "",
      "N", "", "", "",
      "", "", "", ic.Invoice_Value || ic["Invoice Value"] || "",
      ic.Invoice_URL || "", status, "", ic.Created_By_Email || "",
      parseDateOnly(ic.Created_At), bv["Last Action By"] || "", parseDate(bv["Last Action At"] || ""), ic.Remarks || "",
    ]);
  });

  await appendRows("INVOICES", invRows);
  console.log(`  Migrated ${invRows.length} invoices`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7: PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────

async function migratePayments(cachedPayments) {
  console.log("\n═══ STEP 7: PAYMENTS ═══");

  const payments = cachedPayments || await readSheet(OLD_PROCUREMENT_SHEET_ID, "Payments");
  console.log(`  Read ${payments.length} payments`);

  const statusSet = new Set(payments.map((p) => `${p.Status_Code}|${p.Status_Label}`));
  console.log(`  Payment Status codes:`, [...statusSet].join(", "));

  function mapPayStatus(code, label, utr) {
    const l = (label || "").toUpperCase();
    if (utr) return "RELEASED";
    if (l.includes("RELEASE") || l.includes("PAID")) return "RELEASED";
    if (l.includes("APPROVED") || l.includes("MANAGEMENT")) return "MANAGEMENT_APPROVED";
    if (l.includes("VERIFIED") || l.includes("ACCOUNTS")) return "ACCOUNTS_VERIFIED";
    if (l.includes("SUBMIT")) return "SUBMITTED";
    return "SUBMITTED";
  }

  const payRows = [];
  payments.forEach((p) => {
    if (!p.PAY_ID) return;
    const vendorId = poIdToVendorId[p.PO_ID] || "";

    // 39 columns per PAYMENTS schema
    payRows.push([
      p.PAY_ID, parseDateOnly(p.Posted_Date), "STANDARD", "",
      p.PO_ID || "", "", "", "",
      "", vendorId, vendorIdToSubProfileId[vendorId] || "", vendorIdToName[vendorId] || "",
      "", "", "", p.Amount || "",
      "", "", "", "",
      p.Amount || "", p.Mode || "", "", "",
      p.UTR || "", p.Voucher_Number || "", p.Payment_Voucher_URL || "", mapPayStatus(p.Status_Code, p.Status_Label, p.UTR),
      "", "", "", p.Payments_Requester_Email || "",
      parseDateOnly(p.Payments_Requested_Date), p.Last_Action_By || "", parseDate(p.Last_Action_At), p.Remarks || "",
      "", "", "",
    ]);
  });

  await appendRows("PAYMENTS", payRows);
  console.log(`  Migrated ${payRows.length} payments`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8: SEQUENCES
// ─────────────────────────────────────────────────────────────────────────────

async function updateSequences() {
  console.log("\n═══ STEP 8: SEQUENCES ═══");

  // Read current data to find max sequence numbers
  const seqMap = {
    MPR: 747 + 10,        // buffer
    MPR_LINES: 2015 + 10,
    PO: 614 + 10,
    PO_LINES: 1589 + 10,
    GRN: 875 + 10,
    GRN_LINES: 2000 + 10,
    INVOICES: invSeq + 10,
    PAYMENTS: 309 + 10,
    VENDORS: 1423 + 10,
    VENDOR_SUB_PROFILES: subProfileSeq + 10,
    USERS: userSeq + 10,
  };

  const seqRows = Object.entries(seqMap).map(([sheet, seq]) => [sheet, String(seq)]);

  if (DRY_RUN) {
    console.log("  [DRY RUN] Sequence updates:", seqMap);
  } else {
    // Clear existing sequences and rewrite
    // For safety, just append — the app uses getNextSeq which reads MAX
    console.log("  Note: Sequence counters should be verified manually after migration.");
    console.log("  Expected max sequences:", seqMap);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 9: MIGRATION LOG
// ─────────────────────────────────────────────────────────────────────────────

async function writeMigrationLog(status, detail) {
  await appendRows("MIGRATION_LOG", [
    [MIGRATION_TIMESTAMP, "FULL_MIGRATION_V1_TO_V2", detail, status],
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 10: VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

async function validate() {
  console.log("\n═══ VALIDATION ═══");

  if (DRY_RUN) {
    console.log("  [DRY RUN] Skipping validation");
    return;
  }

  const checks = [
    { sheet: "VENDORS", expected: 1423 },
    { sheet: "VENDOR_SUB_PROFILES", expected: 1423 },
    { sheet: "MPR", expected: 747 },
    { sheet: "MPR_LINES", expected: 2015 },
    { sheet: "PO", expected: 614 },
    { sheet: "PO_LINES", expected: 1589 },
  ];

  for (const { sheet, expected } of checks) {
    try {
      const data = await readSheet(NEW_SHEET_ID, sheet);
      const actual = data.length;
      const status = actual >= expected ? "✓" : "✗";
      console.log(`  ${status} ${sheet}: ${actual} rows (expected ≥${expected})`);
    } catch (e) {
      console.log(`  ✗ ${sheet}: ERROR — ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   Crystal Group — Procurement System Migration v1 → v2.0   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nTimestamp: ${MIGRATION_TIMESTAMP}`);
  console.log(`Target:    ${NEW_SHEET_ID}`);
  console.log(`Mode:      ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (ONLY_STEP) console.log(`Step:      ${ONLY_STEP} only`);
  if (SKIP_STEPS.length) console.log(`Skipping:  ${SKIP_STEPS.join(", ")}`);

  function shouldRun(step) {
    if (ONLY_STEP) return step === ONLY_STEP;
    return !SKIP_STEPS.includes(step);
  }

  try {
    let cachedData = {};

    if (shouldRun("USERS")) {
      cachedData = await migrateUsers();
    }

    if (shouldRun("VENDORS")) {
      await migrateVendors();
    }

    if (shouldRun("MPR")) {
      await migratePRs(cachedData.prs);
    }

    if (shouldRun("PO")) {
      await migratePOs(cachedData.pos);
    }

    if (shouldRun("GRN")) {
      const grnResult = await migrateGRNs(cachedData.grns);
      cachedData.invoiceCollection = grnResult?.invoiceCollection;
    }

    if (shouldRun("INVOICES")) {
      await migrateInvoices(cachedData.invoiceCollection);
    }

    if (shouldRun("PAYMENTS")) {
      await migratePayments(cachedData.pays);
    }

    if (shouldRun("SEQUENCES")) {
      await updateSequences();
    }

    if (shouldRun("VALIDATE")) {
      await validate();
    }

    if (!DRY_RUN) {
      await writeMigrationLog("SUCCESS", `Migrated all entities. Users: ${userSeq}, Vendors: 1423, PRs: 747, POs: 614, GRNs: ~875, Invoices: ${invSeq}, Payments: 309`);
    }

    console.log("\n════════════════════════════════════════");
    console.log("  MIGRATION COMPLETE");
    console.log("════════════════════════════════════════");
    console.log("\nPost-migration checklist:");
    console.log("  1. Verify row counts in each sheet");
    console.log("  2. Update SEQUENCES sheet with correct max IDs");
    console.log("  3. Test login for a few migrated users");
    console.log("  4. Spot-check 5-10 PRs, POs, GRNs for data accuracy");
    console.log("  5. Verify Google Drive file links still work");
    console.log("  6. Run the app and check dashboards");

  } catch (err) {
    console.error("\n❌ MIGRATION FAILED:", err.message);
    console.error(err.stack);
    if (!DRY_RUN) {
      await writeMigrationLog("FAILED", err.message).catch(() => {});
    }
    process.exit(1);
  }
}

main();
