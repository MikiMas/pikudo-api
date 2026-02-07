import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { createRoute, listRoutes, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

type Body = {
  title?: unknown;
  description?: unknown;
  city?: unknown;
  difficulty?: unknown;
  distance_km?: unknown;
  estimated_minutes?: unknown;
  start_lat?: unknown;
  start_lng?: unknown;
  is_public?: unknown;
};

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const routes = await listRoutes();
    return apiJson(req, { ok: true, routes });
  } catch (error) {
    return apiJson(req, { ok: false, error: normalizeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) {
      return apiJson(req, { ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const startLat = typeof body.start_lat === "number" ? body.start_lat : Number.NaN;
    const startLng = typeof body.start_lng === "number" ? body.start_lng : Number.NaN;

    if (!title || !Number.isFinite(startLat) || !Number.isFinite(startLng)) {
      return apiJson(req, { ok: false, error: "TITLE_AND_START_COORDS_REQUIRED" }, { status: 400 });
    }

    const route = await createRoute(user.id, {
      title,
      description: typeof body.description === "string" ? body.description.trim() : null,
      city: typeof body.city === "string" ? body.city.trim() : null,
      difficulty: body.difficulty === "easy" || body.difficulty === "medium" || body.difficulty === "hard" ? body.difficulty : "medium",
      distance_km: typeof body.distance_km === "number" ? body.distance_km : null,
      estimated_minutes: typeof body.estimated_minutes === "number" ? body.estimated_minutes : null,
      start_lat: startLat,
      start_lng: startLng,
      is_public: typeof body.is_public === "boolean" ? body.is_public : true
    });

    return apiJson(req, { ok: true, route }, { status: 201 });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

