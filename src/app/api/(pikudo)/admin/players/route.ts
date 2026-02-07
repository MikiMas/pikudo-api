import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type PlayerRow = { id: string; nickname: string; points: number; created_at: string };

export async function GET(req: Request) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("players")
    .select("id,nickname,points,created_at")
    .order("points", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(500)
    .returns<PlayerRow[]>();

  if (error) return apiJson(req, { ok: false, error: error.message }, { status: 500 });
  return apiJson(req, { ok: true, players: data ?? [] });
}



