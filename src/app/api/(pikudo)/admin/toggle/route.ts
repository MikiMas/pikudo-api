import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type AdminSettingsRow = { game_status: string | null };

export async function POST(req: Request) {
  return apiJson(req, { ok: false, error: "PAUSE_DISABLED" }, { status: 400 });
}


