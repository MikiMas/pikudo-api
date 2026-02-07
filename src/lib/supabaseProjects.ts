export type SupabaseProject = "pikudo" | "sumo" | "telegram" | "paypal";

type SupabaseKeyKind = "url" | "serviceRole" | "anon";

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function buildNames(project: SupabaseProject, kind: SupabaseKeyKind): string[] {
  const projectUpper = project.toUpperCase();

  if (kind === "url") {
    const names = [`SUPABASE_${projectUpper}_URL`, `SUPABASE_URL_${projectUpper}`];
    if (project === "pikudo") {
      names.push("SUPABASE_URL");
    }
    return names;
  }

  if (kind === "serviceRole") {
    const names = [
      `SUPABASE_${projectUpper}_SERVICE_ROLE_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY_${projectUpper}`
    ];
    if (project === "pikudo") {
      names.push("SUPABASE_SERVICE_ROLE_KEY");
    }
    return names;
  }

  const names = [`SUPABASE_${projectUpper}_ANON_KEY`, `SUPABASE_ANON_KEY_${projectUpper}`];
  if (project === "pikudo") {
    names.push("SUPABASE_ANON_KEY");
  }
  return names;
}

export function getSupabaseProjectEnv(
  project: SupabaseProject,
  kind: SupabaseKeyKind
): string | undefined {
  return firstEnv(buildNames(project, kind));
}

export function requireSupabaseProjectEnv(project: SupabaseProject, kind: SupabaseKeyKind): string {
  const value = getSupabaseProjectEnv(project, kind);
  if (value) {
    return value;
  }

  const expected = buildNames(project, kind).join(" | ");
  throw new Error(`Missing Supabase env for project "${project}". Expected one of: ${expected}`);
}
