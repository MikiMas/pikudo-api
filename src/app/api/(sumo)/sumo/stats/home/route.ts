import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/(sumo)/sumo/_lib/auth";
import { getHomeStats, normalizeErrorMessage } from "@/app/api/(sumo)/sumo/_lib/repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const stats = await getHomeStats(user.id);
    return apiJson(req, { ok: true, stats });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

