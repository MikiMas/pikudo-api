import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/(sumo)/sumo/_lib/auth";
import { getMyActiveSession, normalizeErrorMessage } from "@/app/api/(sumo)/sumo/_lib/repository";

export const runtime = "nodejs";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;

  try {
    const user = await requireSumoUser(req);
    const session = await getMyActiveSession(routeId, user.id);
    return apiJson(req, { ok: true, session });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

