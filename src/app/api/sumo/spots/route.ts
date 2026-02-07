import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { createSpot, listSpots, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

type Body = {
  name?: unknown;
  description?: unknown;
  city?: unknown;
  lat?: unknown;
  lng?: unknown;
  is_public?: unknown;
};

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const spots = await listSpots();
    return apiJson(req, { ok: true, spots });
  } catch (error) {
    return apiJson(req, { ok: false, error: normalizeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const lat = typeof body?.lat === "number" ? body.lat : Number.NaN;
    const lng = typeof body?.lng === "number" ? body.lng : Number.NaN;

    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return apiJson(req, { ok: false, error: "NAME_AND_COORDS_REQUIRED" }, { status: 400 });
    }

    const spot = await createSpot(user.id, {
      name,
      description: typeof body?.description === "string" ? body.description.trim() : null,
      city: typeof body?.city === "string" ? body.city.trim() : null,
      lat,
      lng,
      is_public: typeof body?.is_public === "boolean" ? body.is_public : true
    });

    return apiJson(req, { ok: true, spot }, { status: 201 });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

