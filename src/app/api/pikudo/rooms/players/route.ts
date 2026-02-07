import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateRoomCode } from "@/app/api/pikudo/_lib/validators";

export const runtime = "nodejs";

type PlayerRow = { id: string; nickname: string; points: number; created_at?: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.toUpperCase();
  if (!validateRoomCode(code)) return apiJson(req, { ok: false, error: "INVALID_ROOM_CODE" }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: room, error: roomError } = await supabase.from("rooms").select("id").eq("code", code).maybeSingle<{ id: string }>();
  if (roomError) return apiJson(req, { ok: false, error: roomError.message }, { status: 500 });
  if (!room) return apiJson(req, { ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id,nickname,points,created_at")
    .eq("room_id", room.id)
    .order("created_at", { ascending: true })
    .returns<PlayerRow[]>();

  if (playersError) return apiJson(req, { ok: false, error: playersError.message }, { status: 500 });

  return apiJson(req, { ok: true, players: players ?? [] });
}



