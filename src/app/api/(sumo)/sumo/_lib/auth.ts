import { createClient, type Session } from "@supabase/supabase-js";

import { supabaseAdminForProject } from "@/lib/supabaseAdmin";
import { getSupabaseProjectEnv, requireSupabaseProjectEnv } from "@/lib/supabaseProjects";

type AuthenticatedSumoUser = {
  id: string;
  email: string | null;
  accessToken: string;
};

const SUMO_PROJECT = "sumo" as const;

function getSumoAuthKey(): string {
  const anon = getSupabaseProjectEnv(SUMO_PROJECT, "anon");
  if (anon) {
    return anon;
  }

  const service = getSupabaseProjectEnv(SUMO_PROJECT, "serviceRole");
  if (service) {
    return service;
  }

  throw new Error(
    "Missing Supabase auth key for project \"sumo\". Expected SUPABASE_SUMO_ANON_KEY (or SUPABASE_ANON_KEY_SUMO)."
  );
}

let authClient: ReturnType<typeof createClient> | null = null;

function getAuthClient() {
  if (!authClient) {
    authClient = createClient(requireSupabaseProjectEnv(SUMO_PROJECT, "url"), getSumoAuthKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return authClient;
}

export function readBearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (!scheme || !token) {
    return null;
  }

  if (scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim() || null;
}

export async function requireSumoUser(req: Request): Promise<AuthenticatedSumoUser> {
  const accessToken = readBearerToken(req);
  if (!accessToken) {
    throw new Error("UNAUTHORIZED");
  }

  const supabase = supabaseAdminForProject(SUMO_PROJECT);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    accessToken
  };
}

export function toSessionPayload(session: Session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: {
      id: session.user.id,
      email: session.user.email ?? null
    }
  };
}

export async function loginWithPassword(email: string, password: string) {
  const auth = getAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.session || !data.user) {
    throw new Error(error?.message ?? "INVALID_CREDENTIALS");
  }

  return {
    user: data.user,
    session: data.session
  };
}

export async function registerWithPassword(input: {
  email: string;
  password: string;
  username?: string;
}) {
  const auth = getAuthClient();

  const normalizedUsername = input.username?.trim();
  const metadata = normalizedUsername ? { username: normalizedUsername } : undefined;

  const signUp = await auth.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: metadata
    }
  });

  if (signUp.error) {
    throw new Error(signUp.error.message);
  }

  if (!signUp.data.user) {
    throw new Error("REGISTER_FAILED");
  }

  let session = signUp.data.session ?? null;

  if (!session) {
    const signIn = await auth.auth.signInWithPassword({
      email: input.email,
      password: input.password
    });

    if (signIn.error || !signIn.data.session) {
      throw new Error(signIn.error?.message ?? "REGISTER_SIGNIN_FAILED");
    }

    session = signIn.data.session;
  }

  return {
    user: signUp.data.user,
    session
  };
}

export async function logoutByToken(accessToken: string) {
  const supabase = supabaseAdminForProject(SUMO_PROJECT);
  const adminAuth = supabase.auth.admin as unknown as {
    signOut?: (jwt: string, scope?: "global" | "local" | "others") => Promise<{ error: { message?: string } | null }>;
  };

  if (!adminAuth.signOut) {
    return;
  }

  const { error } = await adminAuth.signOut(accessToken, "global");
  if (error) {
    throw new Error(error.message ?? "LOGOUT_FAILED");
  }
}
