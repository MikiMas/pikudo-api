import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { createRoutePlan, listRoutePlans, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

type Body = {
  planned_at?: unknown;
  note?: unknown;
};

export const runtime = "nodejs";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;
  try {
    const plans = await listRoutePlans(routeId);
    return apiJson(req, { ok: true, plans });
  } catch (error) {
    return apiJson(req, { ok: false, error: normalizeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;
  try {
    const user = await requireSumoUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    const plannedAt = typeof body?.planned_at === "string" ? body.planned_at.trim() : "";
    if (!plannedAt) {
      return apiJson(req, { ok: false, error: "PLANNED_AT_REQUIRED" }, { status: 400 });
    }

    const row = await createRoutePlan({
      routeId,
      userId: user.id,
      plannedAt,
      note: typeof body?.note === "string" ? body.note.trim() : null
    });
    return apiJson(req, { ok: true, plan: row }, { status: 201 });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}
