import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getFrontendOrigin } from "./config";

export function rejectInvalidOrigin(request: NextRequest): NextResponse | null {
  const frontendOrigin = getFrontendOrigin();
  if (!frontendOrigin) {
    return NextResponse.json(
      { message: "BubbleDrop frontend origin is not configured." },
      { status: 503 },
    );
  }

  if (request.headers.get("origin") !== frontendOrigin) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  return null;
}
