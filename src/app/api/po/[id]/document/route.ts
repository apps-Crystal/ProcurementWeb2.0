/**
 * GET  /api/po/[id]/document
 *   Redirects to the stored PDF URL for this PO (Google Drive).
 *   Returns 404 if the PDF has not been generated yet.
 *   No auth required — vendors access this via email links.
 *
 * POST /api/po/[id]/document
 *   Receives the generated PDF blob from the internal print page,
 *   uploads it to Google Drive under ROOT/PO/<PO_ID>/PO-<id>.pdf,
 *   and writes the Drive URL back to the PO sheet (PDF_URL column).
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere } from "@/lib/sheets";
import { uploadFileToDrive } from "@/lib/drive";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rows = await readSheet("PO");
  const po   = rows.find((r) => r.PO_ID === id);

  if (!po) {
    return NextResponse.json({ error: "PO not found" }, { status: 404 });
  }

  // If Drive PDF exists, serve it directly; otherwise fall back to the printable page
  // so vendors can still view and download the PO even before the PDF is uploaded.
  const target = po.PO_PDF_URL || new URL(`/po/${id}/print`, req.url).toString();
  return NextResponse.redirect(target);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const result = await uploadFileToDrive(file, "PO", id, `PO-${id}.pdf`);

    await updateRowWhere("PO", "PO_ID", id, { PO_PDF_URL: result.web_view_link });

    return NextResponse.json({ url: result.web_view_link });
  } catch (err) {
    console.error("[po/document POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
