import { NextRequest } from "next/server";
import { getValidatedSessionStatus } from "../../../_lib/proxy";

export async function GET(request: NextRequest) {
  return getValidatedSessionStatus(request);
}
