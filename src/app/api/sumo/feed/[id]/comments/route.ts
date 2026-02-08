import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { createFeedComment, listFeedComments, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

export const runtime = "nodejs";

type CommentBody = {
  body?: unknown;
  parent_comment_id?: unknown;
};

function parseLimit(raw: string | null, fallback = 100) {
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(300, Math.max(1, Math.trunc(parsed)));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = await params;
    const postId = resolved.id;

    if (!postId) {
      return apiJson(req, { ok: false, error: "POST_ID_REQUIRED" }, { status: 400 });
    }

    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"), 100);
    const comments = await listFeedComments(postId, limit);
    return apiJson(req, { ok: true, comments, limit });
  } catch (error) {
    return apiJson(req, { ok: false, error: normalizeErrorMessage(error) }, { status: 500 });
  }
}

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

    const body = (await req.json().catch(() => null)) as CommentBody | null;
    if (!body) {
      return apiJson(req, { ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) {
      return apiJson(req, { ok: false, error: "COMMENT_BODY_REQUIRED" }, { status: 400 });
    }

    const parentCommentId =
      typeof body.parent_comment_id === "string" && body.parent_comment_id.trim()
        ? body.parent_comment_id.trim()
        : null;

    const comment = await createFeedComment(postId, user.id, {
      body: text,
      parent_comment_id: parentCommentId
    });

    return apiJson(req, { ok: true, comment }, { status: 201 });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}
