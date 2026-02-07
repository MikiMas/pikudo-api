import { apiJson } from "@/lib/apiJson";
import { loginWithPassword, toSessionPayload } from "@/app/api/sumo/_lib/auth";
import { getProfileById, normalizeErrorMessage } from "@/app/api/sumo/_lib/repository";

type Body = {
  email?: unknown;
  password?: unknown;
};

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return apiJson(req, { ok: false, error: "EMAIL_AND_PASSWORD_REQUIRED" }, { status: 400 });
  }

  try {
    const { user, session } = await loginWithPassword(email, password);
    const profile = await getProfileById(user.id);

    return apiJson(req, {
      ok: true,
      user: {
        id: user.id,
        email: user.email ?? null
      },
      session: toSessionPayload(session),
      profile
    });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const lower = message.toLowerCase();
    console.error("[SUMO_AUTH_LOGIN_ERROR]", message);

    if (message === "INVALID_CREDENTIALS") {
      return apiJson(req, { ok: false, error: message }, { status: 401 });
    }

    if (message === "SERVER_SUPABASE_KEY_INVALID" || lower.includes("invalid api key")) {
      return apiJson(req, { ok: false, error: "SERVER_SUPABASE_KEY_INVALID" }, { status: 500 });
    }

    if (lower.includes("invalid login credentials")) {
      return apiJson(req, { ok: false, error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    return apiJson(req, { ok: false, error: message }, { status: 400 });
  }
}

