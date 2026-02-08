import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { createBikeMedia, listBikeMedia, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

type Body = {
  media_url?: unknown;
  caption?: unknown;
};

export const runtime = "nodejs";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: bikeId } = await context.params;
  try {
    const user = await requireSumoUser(req);
    const media = await listBikeMedia(bikeId, user.id);
    return apiJson(req, { ok: true, media });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: bikeId } = await context.params;
  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    const mediaUrl = typeof body?.media_url === "string" ? body.media_url.trim() : "";
    if (!mediaUrl) {
      return apiJson(req, { ok: false, error: "MEDIA_URL_REQUIRED" }, { status: 400 });
    }

    const row = await createBikeMedia({
      bikeId,
      uploadedBy: user.id,
      mediaUrl,
      caption: typeof body?.caption === "string" ? body.caption.trim() : null
    });

    return apiJson(req, { ok: true, media: row }, { status: 201 });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}
