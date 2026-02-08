import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { checkInRoutePresence, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

type Body = {
  bike_id?: unknown;
};

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;

  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    const bikeId = typeof body?.bike_id === "string" && body.bike_id.length > 0 ? body.bike_id : null;

    const row = await checkInRoutePresence({
      routeId,
      userId: user.id,
      bikeId
    });

    return apiJson(req, { ok: true, row }, { status: 201 });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}
