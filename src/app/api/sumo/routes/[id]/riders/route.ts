import { apiJson } from "@/lib/apiJson";
import { listActiveRiders, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

export const runtime = "nodejs";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;

  try {
    const riders = await listActiveRiders(routeId);
    return apiJson(req, { ok: true, riders });
  } catch (error) {
    return apiJson(req, { ok: false, error: normalizeErrorMessage(error) }, { status: 500 });
  }
}

