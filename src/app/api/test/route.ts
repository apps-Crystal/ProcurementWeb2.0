/**
 * GET /api/test
 * Tests Google Sheets and OpenRouter connections.
 * Remove or restrict this route before production.
 */

import { NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";
import OpenAI from "openai";

export async function GET() {
  const results: Record<string, { ok: boolean; message: string }> = {};

  // ── 1. Google Sheets ────────────────────────────────────────────────────────
  try {
    const rows = await readSheet("USERS");
    results.google_sheets = {
      ok: true,
      message: `Connected. USERS sheet has ${rows.length} row(s).`,
    };
  } catch (err) {
    results.google_sheets = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // ── 2. OpenRouter / Gemini ──────────────────────────────────────────────────
  try {
    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY!,
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "Crystal Group Procurement System",
      },
    });

    const res = await client.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      messages: [{ role: "user", content: 'Reply with exactly: {"status":"ok"}' }],
      response_format: { type: "json_object" },
      max_tokens: 20,
    });

    const reply = res.choices[0]?.message?.content ?? "";
    results.openrouter_gemini = {
      ok: true,
      message: `Connected. Model replied: ${reply}`,
    };
  } catch (err) {
    results.openrouter_gemini = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const allOk = Object.values(results).every((r) => r.ok);

  return NextResponse.json(
    { all_ok: allOk, results },
    { status: allOk ? 200 : 500 }
  );
}
