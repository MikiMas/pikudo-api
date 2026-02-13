import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireSumoUser(req);
    return apiJson(req, { ok: false, error: "BIKE_MODS_DISABLED" }, { status: 410 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

