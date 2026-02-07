import { apiJson } from "@/lib/apiJson";
import { registerWithPassword, toSessionPayload } from "@/app/api/(sumo)/sumo/_lib/auth";
import { getProfileById, normalizeErrorMessage } from "@/app/api/(sumo)/sumo/_lib/repository";

type Body = {
  email?: unknown;
  password?: unknown;
  username?: unknown;
};

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";

  if (!email || !password) {
    return apiJson(req, { ok: false, error: "EMAIL_AND_PASSWORD_REQUIRED" }, { status: 400 });
  }

  if (password.length < 6) {
    return apiJson(req, { ok: false, error: "PASSWORD_TOO_SHORT" }, { status: 400 });
  }

  try {
    const { user, session } = await registerWithPassword({
      email,
      password,
      username: username || undefined
    });

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
    const status = lower.includes("already") || lower.includes("registered") ? 409 : 400;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}

