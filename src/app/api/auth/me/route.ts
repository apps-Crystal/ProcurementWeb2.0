/**
 * GET /api/auth/me
 * Returns current session user from JWT cookie.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifyJwt } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await verifyJwt(token);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}
