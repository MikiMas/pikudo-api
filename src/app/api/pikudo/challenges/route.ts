import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";
import { getBlockStartFromAnchor, secondsToNextBlockFromAnchor } from "@/app/api/pikudo/_lib/timeBlock";
import { validateUuid } from "@/app/api/pikudo/_lib/validators";

export const runtime = "nodejs";

type AssignedChallengeRow = {
  player_challenge_id: string;
  title: string;
  description: string;
  completed: boolean;
};

type FallbackPlayerChallengeRow = {
  id: string;
  challenge_id: string;
  completed: boolean;
};

type FallbackChallengeRow = {
  id: string;
  title: string;
  description: string | null;
};

type RpcAssignResult = {
  data: AssignedChallengeRow[] | null;
  error: { message?: string | null } | null;
};

function normalizeAssignedRows(rows: unknown): AssignedChallengeRow[] {
  if (!Array.isArray(rows)) return [];
  const out: AssignedChallengeRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { player_challenge_id?: unknown }).player_challenge_id ?? "");
    if (!validateUuid(id)) continue;
    out.push({
      player_challenge_id: id,
      title: String((row as { title?: unknown }).title ?? ""),
      description: String((row as { description?: unknown }).description ?? ""),
      completed: Boolean((row as { completed?: unknown }).completed)
    });
  }
  return out;
}

async function loadAssignedRowsFallback(
  supabase: ReturnType<typeof supabaseAdmin>,
  playerId: string,
  blockStartIso: string
): Promise<{ rows: AssignedChallengeRow[]; error: string | null }> {
  const { data: pcs, error: pcsError } = await supabase
    .from("player_challenges")
    .select("id,challenge_id,completed")
    .eq("player_id", playerId)
    .eq("block_start", blockStartIso)
    .limit(3)
    .returns<FallbackPlayerChallengeRow[]>();

  if (pcsError) return { rows: [], error: pcsError.message ?? "FALLBACK_PC_FAILED" };
  const safePcs = (pcs ?? []).filter((r) => validateUuid(r.id) && validateUuid(r.challenge_id));
  if (safePcs.length === 0) return { rows: [], error: null };

  const challengeIds = Array.from(new Set(safePcs.map((r) => r.challenge_id)));
  const { data: challenges, error: challengesError } = await supabase
    .from("challenges")
    .select("id,title,description")
    .in("id", challengeIds)
    .returns<FallbackChallengeRow[]>();
  if (challengesError) return { rows: [], error: challengesError.message ?? "FALLBACK_CHALLENGES_FAILED" };

  const byChallengeId = new Map(
    (challenges ?? []).filter((c) => validateUuid(c.id)).map((c) => [c.id, { title: c.title, description: c.description ?? "" }])
  );

  return {
    rows: safePcs.map((pc) => ({
      player_challenge_id: pc.id,
      title: byChallengeId.get(pc.challenge_id)?.title ?? "Reto",
      description: byChallengeId.get(pc.challenge_id)?.description ?? "",
      completed: Boolean(pc.completed)
    })),
    error: null
  };
}

async function assignRowsViaRpc(
  supabase: ReturnType<typeof supabaseAdmin>,
  playerId: string,
  roomId: string,
  blockStartIso: string
): Promise<{ rows: AssignedChallengeRow[]; error: string | null; missingRpc: boolean }> {
  let rpcResult = (await supabase.rpc("assign_challenges_for_block", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_block_start: blockStartIso
  })) as RpcAssignResult;

  // Some deployments still have the legacy 2-param RPC.
  if (rpcResult.error?.message && /assign_challenges_for_block/i.test(rpcResult.error.message)) {
    rpcResult = (await supabase.rpc("assign_challenges_for_block", {
      p_player_id: playerId,
      p_block_start: blockStartIso
    })) as RpcAssignResult;
  }

  if (rpcResult.error) {
    const msg = rpcResult.error.message ?? "RPC_FAILED";
    const lower = msg.toLowerCase();
    const missingRpc = lower.includes("assign_challenges_for_block") && (lower.includes("not found") || lower.includes("does not exist"));
    return { rows: [], error: msg, missingRpc };
  }

  return { rows: normalizeAssignedRows(rpcResult.data), error: null, missingRpc: false };
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    let playerId = "";
    let roomId = "";
    try {
      const { player } = await requirePlayerFromSession(req);
      playerId = player.id;
      roomId = player.room_id;
      if (!validateUuid(playerId)) {
        return apiJson(req, { ok: false, error: "UNAUTHORIZED" }, { status: 401 });
      }
      if (!validateUuid(roomId)) {
        return apiJson(req, { ok: false, error: "NO_ROOM" }, { status: 400 });
      }
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
    const blockStartIso = blockStart.toISOString();

    // Pause is disabled in app flow; always treat as running here.

    let assignedRows = (await loadAssignedRowsFallback(supabase, playerId, blockStartIso)).rows;
    if (assignedRows.length === 0) {
      const assignRpc = await assignRowsViaRpc(supabase, playerId, roomId, blockStartIso);
      if (assignRpc.error) {
        if (assignRpc.missingRpc) {
          return apiJson(req, { ok: false, error: "MISSING_RPC_ASSIGN_CHALLENGES", hint: "Ejecuta scripts/sql/assign_challenges_for_block.sql en Supabase (SQL Editor)." }, { status: 500 });
        }
        console.error("[CHALLENGES_ASSIGN_ERROR]", assignRpc.error);
        // Graceful degrade: keep game loop alive and retry on next poll.
        return apiJson(req, {
          paused: false,
          state: "running",
          blockStart: blockStartIso,
          nextBlockInSec,
          nextBlockAt: nextBlockAt.toISOString(),
          serverNow: now.toISOString(),
          startedAt: startedAt.toISOString(),
          challenges: []
        });
      }
      assignedRows = assignRpc.rows;
    }

    const ids = assignedRows.map((c) => c.player_challenge_id).filter((id) => validateUuid(id));
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
      challenges: assignedRows.map((c) => ({
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


