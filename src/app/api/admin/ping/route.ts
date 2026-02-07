import { NextResponse } from "next/server";`r`nimport { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  supabaseAdmin();
  return apiJson(req, { ok: true });
}


