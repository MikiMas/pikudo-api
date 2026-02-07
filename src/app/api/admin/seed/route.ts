import { NextResponse } from "next/server";`r`nimport { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { seedChallenges } from "@/lib/seedChallenges";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const result = await seedChallenges(supabase);

    return apiJson(req, { ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return apiJson(req, { ok: false, error: message }, { status: 500 });
  }
}

