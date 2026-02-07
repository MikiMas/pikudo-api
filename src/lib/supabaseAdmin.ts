import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  requireSupabaseProjectEnv,
  type SupabaseProject
} from "@/lib/supabaseProjects";

const clients = new Map<SupabaseProject, SupabaseClient>();

export function supabaseAdmin(project: SupabaseProject = "pikudo"): SupabaseClient {
  const existing = clients.get(project);
  if (existing) {
    return existing;
  }

  const url = requireSupabaseProjectEnv(project, "url");
  const serviceRoleKey = requireSupabaseProjectEnv(project, "serviceRole");

  const client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  clients.set(project, client);
  return client;
}

export function supabaseAdminForProject(project: SupabaseProject): SupabaseClient {
  return supabaseAdmin(project);
}
