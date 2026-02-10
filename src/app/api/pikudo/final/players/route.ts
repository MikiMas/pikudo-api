import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";
import { validateUuid } from "@/app/api/pikudo/_lib/validators";
import { getFinalRoomWindow } from "@/app/api/pikudo/final/_lib/roomWindow";

export const runtime = "nodejs";

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

  const { data: members, error: membersError } = await supabase
    .from("room_members")
    .select("player_id,nickname_at_join,points_at_leave,joined_at")
    .eq("room_id", roomId)
    .limit(500)
    .returns<RoomMemberRow[]>();

  if (membersError) return apiJson(req, { ok: false, error: membersError.message }, { status: 500 });

  const ids = (members ?? []).map((m) => m.player_id);
  if (ids.length === 0) return apiJson(req, { ok: true, players: [] });

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id,nickname,points,created_at")
    .in("id", ids)
    .returns<PlayerRow[]>();

  if (playersError) return apiJson(req, { ok: false, error: playersError.message }, { status: 500 });

  const playerById = new Map((players ?? []).map((p) => [p.id, p]));
  const counts = new Map<string, number>();
  if (ids.length > 0 && roomWindow.startedAtIso && roomWindow.endsAtIso) {
    const { data: rows, error: rowsError } = await supabase
      .from("player_challenges")
      .select("id,player_id,media_url")
      .in("player_id", ids)
      .eq("completed", true)
      .not("media_url", "is", null)
      .gte("block_start", roomWindow.startedAtIso)
      .lt("block_start", roomWindow.endsAtIso)
      .limit(4000);
    if (rowsError) return apiJson(req, { ok: false, error: rowsError.message }, { status: 500 });
    for (const row of rows ?? []) {
      const pid = String((row as any).player_id ?? "");
      if (!pid) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
  }

  const payload = (members ?? []).map((m) => {
    const p = playerById.get(m.player_id);
    const nickname = m.nickname_at_join ?? p?.nickname ?? "Jugador";
    const points = m.points_at_leave ?? p?.points ?? 0;
    const joinedAt = m.joined_at ?? p?.created_at ?? "";
    return {
      id: m.player_id,
      nickname,
      points,
      completedCount: counts.get(m.player_id) ?? 0,
      joinedAt
    };
  });

  payload.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return String(a.joinedAt).localeCompare(String(b.joinedAt));
  });

  return apiJson(req, {
    ok: true,
    players: payload.map(({ joinedAt, ...rest }) => rest)
  });
}


