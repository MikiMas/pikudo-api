import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { normalizeErrorMessage, toggleFeedLike } from "@/app/api/sumo/_lib/repository";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSumoUser(req);
    const resolved = await params;
    const postId = resolved.id;

    if (!postId) {
      return apiJson(req, { ok: false, error: "POST_ID_REQUIRED" }, { status: 400 });
    }

    const result = await toggleFeedLike(postId, user.id);
    return apiJson(req, { ok: true, ...result });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}
