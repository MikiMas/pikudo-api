import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { getProfileById, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireSumoUser(req);
    let profile = null;
    try {
      profile = await getProfileById(user.id);
    } catch (profileError) {
      console.warn("[SUMO_AUTH_ME_PROFILE_ERROR]", normalizeErrorMessage(profileError));
      profile = null;
    }

    return apiJson(req, {
      ok: true,
      user: {
        id: user.id,
        email: user.email
      },
      profile
    });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

