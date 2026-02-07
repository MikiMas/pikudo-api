import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/(sumo)/sumo/_lib/auth";
import { listRoutePoints, normalizeErrorMessage, replaceRoutePoints } from "@/app/api/(sumo)/sumo/_lib/repository";

type Body = {
  points?: unknown;
};

export const runtime = "nodejs";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;

  try {
    const points = await listRoutePoints(routeId);
    return apiJson(req, { ok: true, points });
  } catch (error) {
    return apiJson(req, { ok: false, error: normalizeErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;

  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;

    if (!body || !Array.isArray(body.points)) {
      return apiJson(req, { ok: false, error: "INVALID_POINTS" }, { status: 400 });
    }

    const points = body.points
      .map((point) => {
        if (typeof point !== "object" || !point) return null;
        const raw = point as { lat?: unknown; lng?: unknown };
        if (typeof raw.lat !== "number" || typeof raw.lng !== "number") return null;
        if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lng)) return null;
        return { lat: raw.lat, lng: raw.lng };
      })
      .filter((point): point is { lat: number; lng: number } => Boolean(point));

    if (points.length !== body.points.length) {
      return apiJson(req, { ok: false, error: "INVALID_POINTS" }, { status: 400 });
    }

    await replaceRoutePoints(routeId, user.id, points);
    return apiJson(req, { ok: true, count: points.length });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status =
      message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : message === "ROUTE_NOT_FOUND" ? 404 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

