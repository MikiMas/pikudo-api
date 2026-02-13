import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { getGarageBike, normalizeErrorMessage, updateGarageBike } from "@/app/api/sumo/_lib/repository";

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

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: bikeId } = await context.params;
  try {
    const user = await requireSumoUser(req);
    const bike = await getGarageBike(user.id, bikeId);
    return apiJson(req, { ok: true, bike });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status =
      message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : message === "BIKE_NOT_FOUND" ? 404 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: bikeId } = await context.params;
  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) {
      return apiJson(req, { ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    const patch: {
      brand?: string;
      model?: string;
      year?: number | null;
      nickname?: string | null;
      displacement_cc?: number | null;
      plate?: string | null;
      photo_url?: string | null;
      notes?: string | null;
      is_public?: boolean;
    } = {};

    if ("brand" in body) {
      if (typeof body.brand !== "string" || !body.brand.trim()) {
        return apiJson(req, { ok: false, error: "INVALID_BRAND" }, { status: 400 });
      }
      patch.brand = body.brand.trim();
    }

    if ("model" in body) {
      if (typeof body.model !== "string" || !body.model.trim()) {
        return apiJson(req, { ok: false, error: "INVALID_MODEL" }, { status: 400 });
      }
      patch.model = body.model.trim();
    }

    if ("year" in body) {
      if (body.year == null) {
        patch.year = null;
      } else if (typeof body.year === "number" && Number.isFinite(body.year)) {
        patch.year = Math.trunc(body.year);
      } else {
        return apiJson(req, { ok: false, error: "INVALID_YEAR" }, { status: 400 });
      }
    }

    if ("nickname" in body) {
      patch.nickname = typeof body.nickname === "string" ? body.nickname.trim() || null : null;
    }

    if ("displacement_cc" in body) {
      if (body.displacement_cc == null) {
        patch.displacement_cc = null;
      } else if (typeof body.displacement_cc === "number" && Number.isFinite(body.displacement_cc)) {
        patch.displacement_cc = Math.trunc(body.displacement_cc);
      } else {
        return apiJson(req, { ok: false, error: "INVALID_DISPLACEMENT" }, { status: 400 });
      }
    }

    if ("plate" in body) {
      patch.plate = typeof body.plate === "string" ? body.plate.trim() || null : null;
    }

    if ("photo_url" in body) {
      patch.photo_url = typeof body.photo_url === "string" ? body.photo_url.trim() || null : null;
    }

    if ("notes" in body) {
      patch.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
    }

    if ("is_public" in body) {
      if (typeof body.is_public !== "boolean") {
        return apiJson(req, { ok: false, error: "INVALID_VISIBILITY" }, { status: 400 });
      }
      patch.is_public = body.is_public;
    }

    const bike = await updateGarageBike(user.id, bikeId, patch);
    return apiJson(req, { ok: true, bike });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status =
      message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : message === "BIKE_NOT_FOUND" ? 404 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}
