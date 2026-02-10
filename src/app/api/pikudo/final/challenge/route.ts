import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";
import { validateUuid } from "@/app/api/pikudo/_lib/validators";
import { getFinalRoomWindow } from "@/app/api/pikudo/final/_lib/roomWindow";

export const runtime = "nodejs";

type ChallengeInfoRow = { id: string; title: string; description: string | null };
type MediaRow = {
  id: string;
  media_url: string | null;
  media_type: string | null;
  media_mime: string | null;
  completed_at: string | null;
  players: { id: string; nickname: string } | null;
};
type RoomMemberRow = { player_id: string; nickname_at_join: string | null };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const challengeId = url.searchParams.get("challengeId");
  if (!validateUuid(challengeId)) return apiJson(req, { ok: false, error: "INVALID_CHALLENGE_ID" }, { status: 400 });

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
    .select("player_id,nickname_at_join")
    .eq("room_id", roomId)
    .limit(500)
    .returns<RoomMemberRow[]>();
  if (membersError) return apiJson(req, { ok: false, error: membersError.message }, { status: 500 });
  const ids = (members ?? []).map((m) => String(m.player_id));
  if (ids.length === 0) return apiJson(req, { ok: true, challenge: null, media: [] });

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("id,title,description")
    .eq("id", challengeId!.trim())
    .maybeSingle<ChallengeInfoRow>();
  if (challengeError) return apiJson(req, { ok: false, error: challengeError.message }, { status: 500 });
  if (!challenge) return apiJson(req, { ok: false, error: "NOT_FOUND" }, { status: 404 });

  const { data: rows, error: rowsError } =
    roomWindow.startedAtIso && roomWindow.endsAtIso
      ? await supabase
          .from("player_challenges")
          .select("id,media_url,media_type,media_mime,completed_at, players ( id, nickname )")
          .eq("challenge_id", challengeId!.trim())
          .in("player_id", ids)
          .eq("completed", true)
          .not("media_url", "is", null)
          .gte("block_start", roomWindow.startedAtIso)
          .lt("block_start", roomWindow.endsAtIso)
          .order("completed_at", { ascending: false })
          .limit(4000)
          .returns<MediaRow[]>()
      : { data: [] as MediaRow[], error: null };
  if (rowsError) return apiJson(req, { ok: false, error: rowsError.message }, { status: 500 });

  const nicknameById = new Map((members ?? []).map((m) => [m.player_id, m.nickname_at_join]));

  const media = (rows ?? []).map((r) => {
    const fallbackNick = r.players?.nickname ?? null;
    const nickname = nicknameById.get(r.players?.id ?? "") ?? fallbackNick;
    return {
      id: r.id,
      completedAt: r.completed_at,
      player: r.players ? { id: r.players.id, nickname: nickname ?? "" } : null,
      media: r.media_url ? { url: r.media_url, mime: r.media_mime ?? "", type: r.media_type ?? "" } : null
    };
  });

  return apiJson(req, { ok: true, challenge: { id: challenge.id, title: challenge.title, description: challenge.description }, media });
}


