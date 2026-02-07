import { apiJson } from "@/lib/apiJson";
import { logoutByToken, requireSumoUser } from "@/app/api/(sumo)/sumo/_lib/auth";
import { normalizeErrorMessage } from "@/app/api/(sumo)/sumo/_lib/repository";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireSumoUser(req);
    await logoutByToken(user.accessToken);
    return apiJson(req, { ok: true });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

