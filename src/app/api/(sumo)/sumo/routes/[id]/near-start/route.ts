import { apiJson } from "@/lib/apiJson";
import { isNearRouteStart, normalizeErrorMessage } from "@/app/api/(sumo)/sumo/_lib/repository";

type Body = {
  lat?: unknown;
  lng?: unknown;
  radius_m?: unknown;
};

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const lat = typeof body?.lat === "number" ? body.lat : Number.NaN;
    const lng = typeof body?.lng === "number" ? body.lng : Number.NaN;
    const radius = typeof body?.radius_m === "number" ? body.radius_m : 500;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return apiJson(req, { ok: false, error: "INVALID_COORDINATES" }, { status: 400 });
    }

    const near = await isNearRouteStart(routeId, lat, lng, radius);
    return apiJson(req, { ok: true, near });
  } catch (error) {
    return apiJson(req, { ok: false, error: normalizeErrorMessage(error) }, { status: 400 });
  }
}

