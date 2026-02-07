import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { createBike, listGarage, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

type Body = {
  brand?: unknown;
  model?: unknown;
  year?: unknown;
  nickname?: unknown;
  displacement_cc?: unknown;
  plate?: unknown;
  photo_url?: unknown;
  notes?: unknown;
  is_public?: unknown;
};

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const bikes = await listGarage(user.id);
    return apiJson(req, { ok: true, bikes });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) {
      return apiJson(req, { ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    const brand = typeof body.brand === "string" ? body.brand.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";

    if (!brand || !model) {
      return apiJson(req, { ok: false, error: "BRAND_AND_MODEL_REQUIRED" }, { status: 400 });
    }

    const bike = await createBike(user.id, {
      brand,
      model,
      year: typeof body.year === "number" ? body.year : null,
      nickname: typeof body.nickname === "string" ? body.nickname.trim() : null,
      displacement_cc: typeof body.displacement_cc === "number" ? body.displacement_cc : null,
      plate: typeof body.plate === "string" ? body.plate.trim() : null,
      photo_url: typeof body.photo_url === "string" ? body.photo_url.trim() : null,
      notes: typeof body.notes === "string" ? body.notes.trim() : null,
      is_public: typeof body.is_public === "boolean" ? body.is_public : true
    });

    return apiJson(req, { ok: true, bike }, { status: 201 });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

