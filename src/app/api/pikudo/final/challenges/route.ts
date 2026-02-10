import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";
import { validateUuid } from "@/app/api/pikudo/_lib/validators";
import { getFinalRoomWindow } from "@/app/api/pikudo/final/_lib/roomWindow";

export const runtime = "nodejs";

type ChallengeRow = {
  challenge_id: string;
  media_url: string | null;
  challenges: { title: string; description: string | null } | null;
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

  const { data: players, error: playersError } = await supabase
    .from("room_members")
    .select("player_id")
    .eq("room_id", roomId)
    .limit(500);
  if (playersError) return apiJson(req, { ok: false, error: playersError.message }, { status: 500 });
  const ids = (players ?? []).map((p: any) => String(p.player_id));
  if (ids.length === 0) return apiJson(req, { ok: true, challenges: [] });
  if (!roomWindow.startedAtIso || !roomWindow.endsAtIso) return apiJson(req, { ok: true, challenges: [] });

  const { data: rows, error: rowsError } = await supabase
    .from("player_challenges")
    .select("challenge_id,media_url, challenges ( title, description )")
    .in("player_id", ids)
    .eq("completed", true)
    .not("media_url", "is", null)
    .gte("block_start", roomWindow.startedAtIso)
    .lt("block_start", roomWindow.endsAtIso)
    .limit(4000)
    .returns<ChallengeRow[]>();
  if (rowsError) return apiJson(req, { ok: false, error: rowsError.message }, { status: 500 });

  const byChallenge = new Map<
    string,
    { id: string; title: string; description: string | null; mediaCount: number }
  >();
  for (const row of rows ?? []) {
    const cid = String(row.challenge_id ?? "");
    if (!cid) continue;
    const title = row.challenges?.title ?? "(sin titulo)";
    const description = row.challenges?.description ?? null;
    if (!byChallenge.has(cid)) {
      byChallenge.set(cid, { id: cid, title, description, mediaCount: 0 });
    }
    if (row.media_url) {
      const entry = byChallenge.get(cid);
      if (entry) entry.mediaCount += 1;
    }
  }

  return apiJson(req, { ok: true, challenges: Array.from(byChallenge.values()) });
}


