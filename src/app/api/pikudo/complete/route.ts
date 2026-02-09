import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateUuid } from "@/app/api/pikudo/_lib/validators";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";
import { getBlockStartFromAnchor } from "@/app/api/pikudo/_lib/timeBlock";

export const runtime = "nodejs";

type CompleteResultRow = { points: number; completed_now: boolean };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { playerChallengeId?: unknown } | null;
    const playerChallengeId = body?.playerChallengeId;
    if (!validateUuid(playerChallengeId)) {
      return apiJson(req, { ok: false, error: "INVALID_PLAYER_CHALLENGE_ID" }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    let playerId = "";
    let roomId = "";
    try {
      const { player } = await requirePlayerFromSession(req);
      playerId = player.id;
      roomId = player.room_id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "UNAUTHORIZED";
      const status = msg === "UNAUTHORIZED" ? 401 : 500;
      return apiJson(req, { ok: false, error: msg }, { status });
    }

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("rounds,status,starts_at")
      .eq("id", roomId)
      .maybeSingle<{ rounds: number; status: string; starts_at: string | null }>();
    if (roomError || !room) return apiJson(req, { ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    const roomStatus = String(room.status ?? "").toLowerCase();
    if (roomStatus !== "running") {
      if (roomStatus === "ended") return apiJson(req, { ok: false, error: "ROOM_ALREADY_ENDED" }, { status: 403 });
      return apiJson(req, { ok: false, error: "GAME_NOT_STARTED" }, { status: 403 });
    }

    const startedAtIso = room.starts_at ?? null;
    if (!startedAtIso) return apiJson(req, { ok: false, error: "GAME_NOT_STARTED" }, { status: 403 });
    // Pause is disabled in app flow; do not block completions.

    const startedAt = new Date(startedAtIso);
    if (!Number.isFinite(startedAt.getTime())) {
      return apiJson(req, { ok: false, error: "GAME_NOT_STARTED" }, { status: 403 });
    }
    const rounds = Math.min(9, Math.max(1, Math.floor(room.rounds ?? 1)));
    const endsAt = new Date(startedAt.getTime() + rounds * 30 * 60 * 1000);
    const now = new Date();
    if (now.getTime() >= endsAt.getTime()) return apiJson(req, { ok: false, error: "ROOM_ALREADY_ENDED" }, { status: 403 });

    const blockStart = getBlockStartFromAnchor(now, startedAt);

    const { data, error } = (await supabase.rpc("complete_player_challenge", {
      p_room_id: roomId,
      p_player_id: playerId,
      p_player_challenge_id: playerChallengeId.trim(),
      p_block_start: blockStart.toISOString()
    })) as { data: CompleteResultRow[] | null; error: { message: string } | null };

    if (error) {
      return apiJson(req, { ok: false, error: "COMPLETE_FAILED" }, { status: 500 });
    }

    const row = data?.[0];
    if (!row) {
      return apiJson(req, { ok: false, error: "COMPLETE_FAILED" }, { status: 500 });
    }

    return apiJson(req, { ok: true, points: row.points, completedNow: row.completed_now });
  } catch {
    return apiJson(req, { ok: false, error: "REQUEST_FAILED" }, { status: 500 });
  }
}


