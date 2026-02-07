import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/(sumo)/sumo/_lib/auth";
import { normalizeErrorMessage, sendLocationTick } from "@/app/api/(sumo)/sumo/_lib/repository";

type Body = {
  session_id?: unknown;
  lat?: unknown;
  lng?: unknown;
  speed_mps?: unknown;
  heading_deg?: unknown;
  accuracy_m?: unknown;
};

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;

  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;

    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    const lat = typeof body?.lat === "number" ? body.lat : Number.NaN;
    const lng = typeof body?.lng === "number" ? body.lng : Number.NaN;

    if (!sessionId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return apiJson(req, { ok: false, error: "INVALID_TICK_PAYLOAD" }, { status: 400 });
    }

    await sendLocationTick({
      routeId,
      userId: user.id,
      sessionId,
      lat,
      lng,
      speedMps: typeof body?.speed_mps === "number" ? body.speed_mps : null,
      headingDeg: typeof body?.heading_deg === "number" ? body.heading_deg : null,
      accuracyM: typeof body?.accuracy_m === "number" ? body.accuracy_m : null
    });

    return apiJson(req, { ok: true });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status =
      message === "UNAUTHORIZED"
        ? 401
        : message === "FORBIDDEN"
          ? 403
          : message === "SESSION_NOT_FOUND"
            ? 404
            : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

