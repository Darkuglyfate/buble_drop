import { NextResponse } from "next/server";
import { createCsrfToken, setCsrfCookie } from "../../../_lib/csrf";

export async function GET() {
  const csrfToken = createCsrfToken();
  const response = NextResponse.json({ csrfToken });
  setCsrfCookie(response, csrfToken);
  return response;
}
