import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifyJwt } from "@/lib/auth";
import { writeAuditLog } from "@/lib/sheets";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    const user = await verifyJwt(token);
    if (user) {
      await writeAuditLog({ userId: user.userId, userName: user.name ?? "", userRole: user.role ?? "", module: "USERS", recordId: user.userId, action: "LOGOUT" }).catch(() => {});
    }
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}
