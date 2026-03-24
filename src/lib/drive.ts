/**
 * Google Drive utility — Crystal Group Procurement System
 *
 * Folder convention:
 *   <ROOT>/PR/<PR_ID>/         — quotation, proforma, supporting docs
 *   <ROOT>/GRN/<GRN_ID>/       — challan, photos, vendor invoice
 *   <ROOT>/SRN/<SRN_ID>/       — service challan, report
 *   <ROOT>/INVOICES/<INV_ID>/  — vendor invoice PDF
 *   <ROOT>/PO/<PO_ID>/         — generated PO PDF
 *
 * Set GOOGLE_DRIVE_ROOT_FOLDER_ID in .env.local to the shared drive folder ID.
 */

import { google } from "googleapis";
import { Readable } from "stream";

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;

function getDriveAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function getDriveClient() {
  return google.drive({ version: "v3", auth: getDriveAuth() });
}

// ─────────────────────────────────────────────────────────────────────────────
// FOLDER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gets or creates a folder by name inside a parent folder.
 * Returns the folder ID.
 */
async function getOrCreateFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient();

  // Search for existing folder
  const res = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  // Create it
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  return created.data.id!;
}

/**
 * Returns the folder ID for a given entity type and ID.
 * Creates the folder structure if it doesn't exist.
 *
 * Example: getEntityFolder("PR", "PR-2503-0001")
 *   → ROOT / PR / PR-2503-0001 /
 */
export async function getEntityFolder(
  type: "PR" | "GRN" | "SRN" | "INVOICES" | "PO" | "VENDORS" | "FEEDBACK",
  entityId: string
): Promise<string> {
  const typeFolder = await getOrCreateFolder(type, ROOT_FOLDER_ID);
  const entityFolder = await getOrCreateFolder(entityId, typeFolder);
  return entityFolder;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadResult {
  file_id: string;
  file_name: string;
  web_view_link: string;
}

/**
 * Uploads a file (from a Next.js File/Blob) to the entity's Drive folder.
 * Returns the file ID and shareable view link.
 */
export async function uploadFileToDrive(
  file: File,
  entityType: "PR" | "GRN" | "SRN" | "INVOICES" | "PO" | "VENDORS" | "FEEDBACK",
  entityId: string,
  fileNameOverride?: string
): Promise<UploadResult> {
  const drive = getDriveClient();
  const folderId = await getEntityFolder(entityType, entityId);

  const buffer = Buffer.from(await file.arrayBuffer());
  const stream = Readable.from(buffer);
  const fileName = fileNameOverride ?? file.name;

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: file.type || "application/octet-stream",
      body: stream,
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });

  return {
    file_id: res.data.id!,
    file_name: res.data.name!,
    web_view_link: res.data.webViewLink ?? "",
  };
}

/**
 * Uploads multiple files for the same entity.
 * Returns a map of { originalFileName: UploadResult }
 */
export async function uploadMultipleFiles(
  files: { file: File; nameOverride?: string }[],
  entityType: "PR" | "GRN" | "SRN" | "INVOICES" | "PO" | "VENDORS" | "FEEDBACK",
  entityId: string
): Promise<Record<string, UploadResult>> {
  const results: Record<string, UploadResult> = {};
  for (const { file, nameOverride } of files) {
    results[file.name] = await uploadFileToDrive(file, entityType, entityId, nameOverride);
  }
  return results;
}
