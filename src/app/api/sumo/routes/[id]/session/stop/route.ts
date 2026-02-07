import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { normalizeErrorMessage, stopRouteSession } from "@/app/api/sumo/_lib/repository";

type Body = {
  session_id?: unknown;
};

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";

    if (!sessionId) {
      return apiJson(req, { ok: false, error: "SESSION_ID_REQUIRED" }, { status: 400 });
    }

    await stopRouteSession(sessionId, user.id);
    return apiJson(req, { ok: true });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status =
      message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : message === "SESSION_NOT_FOUND" ? 404 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}
