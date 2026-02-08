import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { listProfileFeedPosts, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

export const runtime = "nodejs";

function parsePageParam(raw: string | null, fallback: number, min: number, max: number) {
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

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

    const url = new URL(req.url);
    const limit = parsePageParam(url.searchParams.get("limit"), 20, 1, 100);
    const offset = parsePageParam(url.searchParams.get("offset"), 0, 0, 5000);

    let viewerId: string | null = null;
    try {
      const user = await requireSumoUser(req);
      viewerId = user.id;
    } catch {
      viewerId = null;
    }

    const result = await listProfileFeedPosts(profileId, viewerId, limit, offset);
    return apiJson(req, { ok: true, profile: result.profile, posts: result.posts, paging: { limit, offset } });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "PROFILE_NOT_FOUND" ? 404 : 500;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}
