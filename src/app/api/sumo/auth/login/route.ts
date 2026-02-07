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
    const status = message.toLowerCase().includes("invalid") ? 401 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

