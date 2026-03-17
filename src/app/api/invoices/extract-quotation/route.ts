/**
 * POST /api/invoices/extract-quotation
 *
 * Used on the MPR form "Auto-fill from Quotation" button.
 * Accepts a quotation PDF/image and returns extracted line items
 * for pre-filling the MPR form.
 */

import { NextRequest, NextResponse } from "next/server";
import { extractQuotation } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF, JPG, PNG files are accepted" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const extracted = await extractQuotation(
      base64,
      file.type as "application/pdf" | "image/jpeg" | "image/png"
    );

    return NextResponse.json({ success: true, extracted });
  } catch (err) {
    console.error("[extract-quotation]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
