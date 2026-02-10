import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";
import { validateUuid } from "@/app/api/pikudo/_lib/validators";
import { getFinalRoomWindow } from "@/app/api/pikudo/final/_lib/roomWindow";

export const runtime = "nodejs";

type PlayerRow = { id: string; nickname: string; points: number; room_id: string };
type RoomMemberRow = { player_id: string; nickname_at_join: string | null; points_at_leave: number | null };

type CompletedRow = {
  id: string;
  completed_at: string | null;
  block_start: string;
  media_url: string | null;
  media_type: string | null;
  media_mime: string | null;
  challenges: { title: string; description: string | null } | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  if (!validateUuid(playerId)) return apiJson(req, { ok: false, error: "INVALID_PLAYER_ID" }, { status: 400 });

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

  const { data: member, error: memberError } = await supabase
    .from("room_members")
    .select("player_id,nickname_at_join,points_at_leave")
    .eq("room_id", roomId)
    .eq("player_id", playerId!.trim())
    .maybeSingle<RoomMemberRow>();

  if (memberError) return apiJson(req, { ok: false, error: memberError.message }, { status: 500 });
  if (!member) return apiJson(req, { ok: false, error: "NOT_ALLOWED" }, { status: 403 });

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id,nickname,points,room_id")
    .eq("id", playerId!.trim())
    .maybeSingle<PlayerRow>();

  if (playerError) return apiJson(req, { ok: false, error: playerError.message }, { status: 500 });
  if (!player) return apiJson(req, { ok: false, error: "NOT_FOUND" }, { status: 404 });
  if (member.player_id !== player.id) return apiJson(req, { ok: false, error: "NOT_ALLOWED" }, { status: 403 });

  const { data: rows, error: rowsError } =
    roomWindow.startedAtIso && roomWindow.endsAtIso
      ? await supabase
          .from("player_challenges")
          .select("id,completed_at,block_start,media_url,media_type,media_mime, challenges ( title, description )")
          .eq("player_id", player.id)
          .eq("completed", true)
          .gte("block_start", roomWindow.startedAtIso)
          .lt("block_start", roomWindow.endsAtIso)
          .order("completed_at", { ascending: false })
          .limit(200)
          .returns<CompletedRow[]>()
      : { data: [] as CompletedRow[], error: null };

  if (rowsError) return apiJson(req, { ok: false, error: rowsError.message }, { status: 500 });

  const completed = (rows ?? [])
    .filter((r) => Boolean(r.media_url))
    .map((r) => ({
      id: r.id,
      title: r.challenges?.title ?? "(sin t\u00edtulo)",
      description: r.challenges?.description ?? "",
      completedAt: r.completed_at,
      blockStart: r.block_start,
      media: r.media_url ? { url: r.media_url, mime: r.media_mime ?? "", type: r.media_type ?? "" } : null
    }));

  const nickname = member.nickname_at_join ?? player.nickname;
  const points = member.points_at_leave ?? player.points ?? 0;

  return apiJson(req, { ok: true, player: { id: player.id, nickname, points }, completed });
}


