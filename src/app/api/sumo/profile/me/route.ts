import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { getProfileById, normalizeErrorMessage, upsertProfileById } from "@/app/api/sumo/_lib/repository";

type Body = {
  username?: unknown;
  display_name?: unknown;
  home_city?: unknown;
  bio?: unknown;
  default_share_live_location?: unknown;
};

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const profile = await getProfileById(user.id);
    return apiJson(req, { ok: true, profile });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) {
      return apiJson(req, { ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    const profile = await upsertProfileById(user.id, {
      username: typeof body.username === "string" ? body.username.trim() : undefined,
      display_name: typeof body.display_name === "string" ? body.display_name.trim() : null,
      home_city: typeof body.home_city === "string" ? body.home_city.trim() : null,
      bio: typeof body.bio === "string" ? body.bio.trim() : null,
      default_share_live_location:
        typeof body.default_share_live_location === "boolean" ? body.default_share_live_location : undefined
    });

    return apiJson(req, { ok: true, profile });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

