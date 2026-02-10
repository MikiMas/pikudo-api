import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";
import { validateUuid } from "@/app/api/pikudo/_lib/validators";
import { getFinalRoomWindow } from "@/app/api/pikudo/final/_lib/roomWindow";

export const runtime = "nodejs";

type LeaderRow = { id: string; nickname: string; points: number; joinedAt: string };
type PlayerRow = { id: string; nickname: string; points: number; created_at?: string | null };
type RoomMemberRow = {
  player_id: string;
  nickname_at_join: string | null;
  points_at_leave: number | null;
  joined_at: string;
};

export async function GET(req: Request) {
  const supabase = supabaseAdmin();
  let roomId = "";
  try {
    const { player } = await requirePlayerFromSession(req);
    roomId = player.room_id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNAUTHORIZED";
    return apiJson(req, { ok: false, error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }

  if (!validateUuid(roomId)) return apiJson(req, { ok: false, error: "NO_ROOM" }, { status: 400 });

  const roomWindow = await getFinalRoomWindow(supabase, roomId);
  if (!roomWindow.exists) return apiJson(req, { ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });
  if (!roomWindow.ended) return apiJson(req, { ok: false, error: "GAME_NOT_ENDED" }, { status: 400 });

  const { data: room } = await supabase.from("rooms").select("name").eq("id", roomId).maybeSingle<{ name: string | null }>();

  const { data: members, error: membersError } = await supabase
    .from("room_members")
    .select("player_id,nickname_at_join,points_at_leave,joined_at")
    .eq("room_id", roomId)
    .limit(500)
    .returns<RoomMemberRow[]>();

  if (membersError) return apiJson(req, { ok: false, error: membersError.message }, { status: 500 });

  const ids = (members ?? []).map((m) => m.player_id);
  if (ids.length === 0) {
    return apiJson(req, { ok: true, roomName: room?.name ?? null, leaders: [] });
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id,nickname,points,created_at")
    .in("id", ids)
    .returns<PlayerRow[]>();

  if (playersError) return apiJson(req, { ok: false, error: playersError.message }, { status: 500 });

  const playerById = new Map((players ?? []).map((p) => [p.id, p]));

  const leaders = (members ?? []).map((m) => {
    const p = playerById.get(m.player_id);
    const nickname = m.nickname_at_join ?? p?.nickname ?? "Jugador";
    const points = m.points_at_leave ?? p?.points ?? 0;
    const joinedAt = m.joined_at ?? p?.created_at ?? "";
    return { id: m.player_id, nickname, points, joinedAt };
  });

  leaders.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return String(a.joinedAt).localeCompare(String(b.joinedAt));
  });

  return apiJson(req, {
    ok: true,
    roomName: room?.name ?? null,
    leaders: leaders.map(({ joinedAt, ...rest }) => rest)
  });
}


