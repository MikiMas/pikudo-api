import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/(sumo)/sumo/_lib/auth";
import { normalizeErrorMessage, startRouteSession } from "@/app/api/(sumo)/sumo/_lib/repository";

type Body = {
  is_location_shared?: unknown;
};

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;

  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    const isLocationShared = typeof body?.is_location_shared === "boolean" ? body.is_location_shared : true;

    const session = await startRouteSession(routeId, user.id, isLocationShared);
    return apiJson(req, { ok: true, session }, { status: 201 });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

