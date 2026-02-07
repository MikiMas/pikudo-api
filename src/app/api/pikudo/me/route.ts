import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { requirePlayerFromDevice } from "@/app/api/pikudo/_lib/sessionPlayer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { deviceId, player } = await requirePlayerFromDevice(req);
    return apiJson(req, { player, deviceId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNAUTHORIZED";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    return apiJson(req, { ok: false, error: msg }, { status });
  }
}


