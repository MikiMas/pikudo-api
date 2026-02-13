import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { createFeedPost, listFeedPosts, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

export const runtime = "nodejs";

type PostBody = {
  body?: unknown;
  route_id?: unknown;
  media?: Array<{
    media_url?: unknown;
    media_type?: unknown;
    thumb_url?: unknown;
    sort_order?: unknown;
  }>;
};

function parsePageParam(raw: string | null, fallback: number, min: number, max: number) {
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export async function GET(req: Request) {
  try {
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

    const posts = await listFeedPosts(viewerId, limit, offset);
    return apiJson(req, { ok: true, posts, paging: { limit, offset } });
  } catch (error) {
    return apiJson(req, { ok: false, error: normalizeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as PostBody | null;

    if (!body) {
      return apiJson(req, { ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) {
      return apiJson(req, { ok: false, error: "POST_BODY_REQUIRED" }, { status: 400 });
    }

    const routeId = typeof body.route_id === "string" ? body.route_id.trim() : "";
    if (!routeId) {
      return apiJson(req, { ok: false, error: "ROUTE_ID_REQUIRED" }, { status: 400 });
    }

    const media = Array.isArray(body.media)
      ? body.media
          .map((item, index) => ({
            media_url: typeof item.media_url === "string" ? item.media_url.trim() : "",
            media_type: item.media_type === "video" ? ("video" as const) : ("image" as const),
            thumb_url: typeof item.thumb_url === "string" && item.thumb_url.trim() ? item.thumb_url.trim() : null,
            sort_order: typeof item.sort_order === "number" && Number.isFinite(item.sort_order) ? item.sort_order : index
          }))
          .filter((item) => item.media_url.length > 0)
      : [];

    const post = await createFeedPost(user.id, {
      body: text,
      route_id: routeId,
      media
    });

    return apiJson(req, { ok: true, post }, { status: 201 });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

