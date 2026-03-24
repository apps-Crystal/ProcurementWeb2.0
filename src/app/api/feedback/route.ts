/**
 * GET  /api/feedback — list feedback items
 * POST /api/feedback — submit new feedback
 *
 * Access rules (GET):
 *   System_Admin / Management — see ALL records
 *   Everyone else             — items they reported OR are assigned to
 *
 * POST accepts multipart/form-data:
 *   data          — JSON: { type, category, title, description, severity, page_url, browser_info }
 *   screenshot_1  — File (optional, image/* or pdf, max 5 MB)
 *   screenshot_2  — File (optional)
 *   screenshot_3  — File (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId, writeAuditLog } from "@/lib/sheets";
import { uploadFileToDrive } from "@/lib/drive";

const VALID_TYPES      = ["Bug", "Feature_Request", "UI_Issue", "General"] as const;
const VALID_CATEGORIES = ["PR", "PO", "GRN", "Payments", "Vendors", "Invoices", "Reports", "Login", "Other"] as const;
const VALID_SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
const MAX_FILE_SIZE    = 5 * 1024 * 1024; // 5 MB

export async function GET(req: NextRequest) {
  try {
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role")  ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await readSheet("FEEDBACK");
    const isAdmin = callerRole === "System_Admin" || callerRole === "Management";

    const filtered = isAdmin
      ? rows
      : rows.filter((r) => r.REPORTED_BY_USER_ID === callerId || r.ASSIGNED_TO_USER_ID === callerId);

    // Sort descending by CREATED_DATE
    const sorted = filtered.sort((a, b) =>
      (b.CREATED_DATE ?? "").localeCompare(a.CREATED_DATE ?? "")
    );

    return NextResponse.json({ feedback: sorted });
  } catch (err) {
    console.error("[GET /api/feedback]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role")  ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const dataRaw  = formData.get("data") as string;
    if (!dataRaw) {
      return NextResponse.json({ error: "Missing 'data' field" }, { status: 400 });
    }

    const {
      type,
      category,
      title,
      description,
      severity = "Medium",
      page_url = "",
      browser_info = "",
    } = JSON.parse(dataRaw);

    // Validation
    if (!title?.trim())          return NextResponse.json({ error: "title is required" }, { status: 400 });
    if (title.trim().length > 200) return NextResponse.json({ error: "title must be 200 characters or fewer" }, { status: 400 });
    if (!description?.trim())    return NextResponse.json({ error: "description is required" }, { status: 400 });
    if (!VALID_TYPES.includes(type))           return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
    if (!VALID_CATEGORIES.includes(category)) return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
    if (!VALID_SEVERITIES.includes(severity)) return NextResponse.json({ error: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` }, { status: 400 });

    // Screenshot files
    const screenshot1 = formData.get("screenshot_1") as File | null;
    const screenshot2 = formData.get("screenshot_2") as File | null;
    const screenshot3 = formData.get("screenshot_3") as File | null;

    for (const [name, file] of [["screenshot_1", screenshot1], ["screenshot_2", screenshot2], ["screenshot_3", screenshot3]] as const) {
      if (file && file instanceof File) {
        if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
          return NextResponse.json({ error: `${name} must be an image or PDF` }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json({ error: `${name} exceeds 5 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB uploaded)` }, { status: 400 });
        }
      }
    }

    // Generate ID
    const seq        = await getNextSeq("FEEDBACK");
    const feedbackId = generateId("FB", seq);
    const now        = new Date().toISOString();

    // Look up caller name
    const users      = await readSheet("USERS");
    const actor      = users.find((u) => u.USER_ID === callerId);
    const callerName = actor?.FULL_NAME ?? callerId;

    // Upload screenshots (best-effort)
    const noUpload = { web_view_link: "" };
    const [s1Upload, s2Upload, s3Upload] = await Promise.all([
      screenshot1
        ? uploadFileToDrive(screenshot1, "FEEDBACK", feedbackId, "screenshot_1.png").catch(() => noUpload)
        : Promise.resolve(noUpload),
      screenshot2
        ? uploadFileToDrive(screenshot2, "FEEDBACK", feedbackId, "screenshot_2.png").catch(() => noUpload)
        : Promise.resolve(noUpload),
      screenshot3
        ? uploadFileToDrive(screenshot3, "FEEDBACK", feedbackId, "screenshot_3.png").catch(() => noUpload)
        : Promise.resolve(noUpload),
    ]);

    await appendRowByFields("FEEDBACK", {
      FEEDBACK_ID:          feedbackId,
      FEEDBACK_DATE:        now.slice(0, 10),
      TYPE:                 type,
      CATEGORY:             category,
      TITLE:                title.trim(),
      DESCRIPTION:          description.trim(),
      SCREENSHOT_1_URL:     s1Upload.web_view_link,
      SCREENSHOT_2_URL:     s2Upload.web_view_link,
      SCREENSHOT_3_URL:     s3Upload.web_view_link,
      SEVERITY:             severity,
      BROWSER_INFO:         browser_info,
      PAGE_URL:             page_url,
      REPORTED_BY_USER_ID:  callerId,
      REPORTED_BY_NAME:     callerName,
      REPORTED_BY_ROLE:     callerRole,
      STATUS:               "Open",
      PRIORITY:             "",
      ASSIGNED_TO_USER_ID:  "",
      ASSIGNED_TO_NAME:     "",
      RESOLUTION_NOTES:     "",
      RESOLVED_DATE:        "",
      CREATED_DATE:         now,
      LAST_UPDATED_BY:      callerId,
      LAST_UPDATED_DATE:    now,
    });

    await writeAuditLog({
      userId:   callerId,
      module:   "FEEDBACK",
      recordId: feedbackId,
      action:   "FEEDBACK_SUBMITTED",
      remarks:  `${type}: ${title.trim()}`,
    });

    return NextResponse.json({ success: true, feedback_id: feedbackId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/feedback]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
