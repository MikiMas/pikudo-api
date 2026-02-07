import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return apiJson(req, {
    ok: true,
    service: "sumo",
    endpoints: [
      {
        method: "POST",
        path: "/api/sumo/roads/snap",
        description: "Ajusta una traza GPS a carretera manteniendo el orden exacto de puntos"
      }
    ]
  });
}


