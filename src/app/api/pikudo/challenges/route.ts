import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";
import { getBlockStartFromAnchor, secondsToNextBlockFromAnchor } from "@/app/api/pikudo/_lib/timeBlock";

export const runtime = "nodejs";

type AssignedChallengeRow = {
  player_challenge_id: string;
  title: string;
  description: string;
  completed: boolean;
};

export async function GET(req: Request) {
  try {
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

    const now = new Date();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id,starts_at,ends_at,status,rounds")
      .eq("id", roomId)
      .maybeSingle<{ id: string; starts_at: string; ends_at: string; status: string; rounds: number }>();
    if (roomError || !room) return apiJson(req, { ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    const roomStatus = String((room as any)?.status ?? "").toLowerCase();
    if (roomStatus === "ended") {
      return apiJson(req, { paused: false, state: "ended", blockStart: now.toISOString(), nextBlockInSec: 0, nextBlockAt: now.toISOString(), serverNow: now.toISOString() });
    }
    if (roomStatus !== "running") {
      return apiJson(req, { paused: false, state: "scheduled", blockStart: now.toISOString(), nextBlockInSec: 0, nextBlockAt: now.toISOString(), serverNow: now.toISOString() });
    }

    const startedAtIso = String((room as any)?.starts_at ?? "");
    const startedAt = new Date(startedAtIso);
    if (!Number.isFinite(startedAt.getTime())) {
      return apiJson(req, { ok: false, error: "GAME_NOT_STARTED" }, { status: 409 });
    }

    const rounds = Math.min(10, Math.max(1, Math.floor((room as any).rounds ?? 1)));
    const endsAt = new Date(startedAt.getTime() + rounds * 30 * 60 * 1000);
    if (now.getTime() >= endsAt.getTime()) {
      return apiJson(req, { paused: false, state: "ended", blockStart: endsAt.toISOString(), nextBlockInSec: 0, nextBlockAt: endsAt.toISOString(), serverNow: now.toISOString() });
    }

    const blockStart = getBlockStartFromAnchor(now, startedAt);
    const nextBlockInSec = secondsToNextBlockFromAnchor(now, startedAt);
    const nextBlockAt = new Date(blockStart.getTime() + 30 * 60 * 1000);

    // Pause is disabled in app flow; always treat as running here.

    const { data: assigned, error: assignError } = (await supabase.rpc("assign_challenges_for_block", {
      p_room_id: roomId,
      p_player_id: playerId,
      p_block_start: blockStart.toISOString()
    })) as { data: AssignedChallengeRow[] | null; error: { message: string } | null };

    if (assignError) {
      const msg = assignError.message || "RPC_FAILED";
      if (msg.toLowerCase().includes("assign_challenges_for_block")) {
        return apiJson(req, { ok: false, error: "MISSING_RPC_ASSIGN_CHALLENGES", hint: "Ejecuta scripts/sql/assign_challenges_for_block.sql en Supabase (SQL Editor)." }, { status: 500 });
      }
      return apiJson(req, { ok: false, error: "REQUEST_FAILED" }, { status: 500 });
    }

    const ids = (assigned ?? []).map((c) => c.player_challenge_id);
    const { data: mediaRows } =
      ids.length === 0
        ? { data: [] as { id: string; media_url: string | null; media_type: string | null; media_mime: string | null }[] }
        : await supabase.from("player_challenges").select("id,media_url,media_type,media_mime").in("id", ids);
    const mediaById = new Map(
      (mediaRows ?? []).map((r: any) => [
        String(r.id),
        { url: r.media_url ?? null, type: r.media_type ?? null, mime: r.media_mime ?? null }
      ])
    );

    return apiJson(req, {
      paused: false,
      state: "running",
      blockStart: blockStart.toISOString(),
      nextBlockInSec,
      nextBlockAt: nextBlockAt.toISOString(),
      serverNow: now.toISOString(),
      startedAt: startedAt.toISOString(),
      challenges: (assigned ?? []).map((c) => ({
        id: c.player_challenge_id,
        title: c.title,
        description: c.description,
        completed: c.completed,
        hasMedia: Boolean(mediaById.get(c.player_challenge_id)?.url),
        media: mediaById.get(c.player_challenge_id) ?? null
      }))
    });
  } catch {
    return apiJson(req, { ok: false, error: "REQUEST_FAILED" }, { status: 500 });
  }
}


