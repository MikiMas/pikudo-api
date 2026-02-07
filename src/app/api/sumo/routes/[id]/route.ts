import { apiJson } from "@/lib/apiJson";
import { getRoute, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

export const runtime = "nodejs";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await context.params;

  try {
    const route = await getRoute(routeId);
    if (!route) {
      return apiJson(req, { ok: false, error: "ROUTE_NOT_FOUND" }, { status: 404 });
    }

    return apiJson(req, { ok: true, route });
  } catch (error) {
    return apiJson(req, { ok: false, error: normalizeErrorMessage(error) }, { status: 500 });
  }
}

