import { apiJson } from "@/lib/apiJson";
import { listPublicGarageByProfileId, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = await params;
    const profileId = resolved.id;

    if (!profileId) {
      return apiJson(req, { ok: false, error: "PROFILE_ID_REQUIRED" }, { status: 400 });
    }

    const bikes = await listPublicGarageByProfileId(profileId);
    return apiJson(req, { ok: true, bikes });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "PROFILE_NOT_FOUND" ? 404 : 500;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}
