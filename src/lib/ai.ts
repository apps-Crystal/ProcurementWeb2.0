/**
 * AI utility — Crystal Group Procurement System
 * Uses OpenRouter API to call Gemini for invoice and quotation extraction.
 */

import OpenAI from "openai";

const MODEL = "google/gemini-2.0-flash-001";

function getClient() {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Crystal Group Procurement System",
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceLine {
  description: string;
  hsn_sac: string;
  qty: number;
  unit: string;
  rate: number;
  gst_percent: number;
  line_amount: number;
}

export interface ExtractedInvoice {
  invoice_number: string;
  invoice_date: string;
  vendor_name: string;
  vendor_gstin: string;
  po_reference: string;
  lines: InvoiceLine[];
  taxable_amount: number;
  total_gst: number;
  total_payable: number;
  confidence_score: number; // 0–100
}

export interface QuotationLine {
  description: string;
  hsn_code: string;
  uom: string;
  qty: number;
  rate: number;
  gst_percent: number;
  line_total: number;
}

export interface ExtractedQuotation {
  vendor_name: string;
  quotation_date: string;
  lines: QuotationLine[];
  total_amount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts structured invoice data from a base64-encoded PDF or image.
 * Called at GRN stage when vendor invoice is uploaded.
 */
export async function extractInvoice(
  fileBase64: string,
  mimeType: "application/pdf" | "image/jpeg" | "image/png"
): Promise<ExtractedInvoice> {
  const prompt = `You are an invoice extraction AI for a procurement system.
Extract the following fields from this vendor invoice and return ONLY valid JSON with no markdown.

Required JSON structure:
{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "vendor_name": "string",
  "vendor_gstin": "string (15-char GSTIN or empty)",
  "po_reference": "string (PO number mentioned on invoice or empty)",
  "lines": [
    {
      "description": "string",
      "hsn_sac": "string",
      "qty": number,
      "unit": "string",
      "rate": number,
      "gst_percent": number,
      "line_amount": number
    }
  ],
  "taxable_amount": number,
  "total_gst": number,
  "total_payable": number,
  "confidence_score": number (0-100, your confidence in extraction accuracy)
}

Rules:
- All amounts must be numbers (no currency symbols or commas)
- If a field cannot be determined, use empty string or 0
- confidence_score should reflect overall extraction quality`;

  const response = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${fileBase64}` },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";

  try {
    return JSON.parse(raw) as ExtractedInvoice;
  } catch {
    throw new Error(`AI extraction failed to return valid JSON: ${raw.slice(0, 200)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTATION EXTRACTION  (used on MPR form auto-fill)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts line items from a vendor quotation PDF.
 * Used to pre-fill MPR line items automatically.
 */
export async function extractQuotation(
  fileBase64: string,
  mimeType: "application/pdf" | "image/jpeg" | "image/png"
): Promise<ExtractedQuotation> {
  const prompt = `You are a quotation extraction AI. Extract structured data from this vendor quotation.
Return ONLY valid JSON with no markdown.

Required JSON structure:
{
  "vendor_name": "string",
  "quotation_date": "YYYY-MM-DD",
  "lines": [
    {
      "description": "string",
      "hsn_code": "string",
      "uom": "string",
      "qty": number,
      "rate": number,
      "gst_percent": number,
      "line_total": number
    }
  ],
  "total_amount": number
}

Rules:
- All amounts must be plain numbers (no currency symbols or commas)
- If a field is missing, use empty string or 0`;

  const response = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${fileBase64}` },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";

  try {
    return JSON.parse(raw) as ExtractedQuotation;
  } catch {
    throw new Error(`Quotation extraction failed: ${raw.slice(0, 200)}`);
  }
}
