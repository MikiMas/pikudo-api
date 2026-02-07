import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
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
