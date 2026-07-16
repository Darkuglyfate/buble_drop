import { NextRequest, NextResponse } from "next/server";
import { clearCsrfCookie, rejectInvalidCsrf } from "../../../_lib/csrf";
import { rejectInvalidOrigin } from "../../../_lib/origin";
import { clearAuthSessionCookie } from "../../../_lib/session";

export async function POST(request: NextRequest) {
  const rejection = rejectInvalidOrigin(request) ?? rejectInvalidCsrf(request);
  if (rejection) {
    return rejection;
  }

  const response = NextResponse.json({ authenticated: false });
  clearAuthSessionCookie(response);
  clearCsrfCookie(response);
  return response;
}
