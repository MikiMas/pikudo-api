import { apiJson } from "@/lib/apiJson";
import { listRouteFeedPosts, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

export const runtime = "nodejs";

function parsePageParam(raw: string | null, fallback: number, min: number, max: number) {
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;

  if (!routeId) {
    return apiJson(req, { ok: false, error: "ROUTE_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const url = new URL(req.url);
    const limit = parsePageParam(url.searchParams.get("limit"), 20, 1, 100);
    const offset = parsePageParam(url.searchParams.get("offset"), 0, 0, 5000);

    const posts = await listRouteFeedPosts(routeId, limit, offset);
    return apiJson(req, { ok: true, posts, paging: { limit, offset } });
  } catch (error) {
    return apiJson(req, { ok: false, error: normalizeErrorMessage(error) }, { status: 500 });
  }
}
