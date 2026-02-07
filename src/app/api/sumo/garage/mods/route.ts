import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { createBikeMod, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

type Body = {
  bike_id?: unknown;
  name?: unknown;
  category?: unknown;
  notes?: unknown;
};

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) {
      return apiJson(req, { ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    const bikeId = typeof body.bike_id === "string" ? body.bike_id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!bikeId || !name) {
      return apiJson(req, { ok: false, error: "BIKE_ID_AND_NAME_REQUIRED" }, { status: 400 });
    }

    const mod = await createBikeMod(user.id, {
      bike_id: bikeId,
      name,
      category: typeof body.category === "string" ? body.category.trim() : undefined,
      notes: typeof body.notes === "string" ? body.notes.trim() : null
    });

    return apiJson(req, { ok: true, mod }, { status: 201 });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

