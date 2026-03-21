import { minikitConfig } from "../../../minikit.config";

export async function GET() {
  return Response.json(minikitConfig, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
