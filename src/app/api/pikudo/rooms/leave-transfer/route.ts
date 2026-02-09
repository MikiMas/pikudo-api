import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";

export const runtime = "nodejs";

type PlayerRow = { id: string; created_at?: string | null };

export async function POST(req: Request) {
  const supabase = supabaseAdmin();
  let playerId = "";
  let playerNickname = "";
  let playerPoints = 0;
  let playerRoomId: string | null = null;

  try {
    const authed = await requirePlayerFromSession(req);
    playerId = authed.player.id;
    playerNickname = authed.player.nickname;
    playerPoints = authed.player.points ?? 0;
    playerRoomId = authed.player.room_id ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNAUTHORIZED";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    return apiJson(req, { ok: false, error: msg }, { status });
  }

  try {
    if (!playerRoomId) {
      const { error: detachError } = await supabase.from("players").update({ room_id: null, nickname: playerNickname }).eq("id", playerId);
      if (detachError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });
      return apiJson(req, { ok: true });
    }

    const roomId = playerRoomId;

    const { data: member } = await supabase
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("player_id", playerId)
      .maybeSingle<{ role: string }>();

    if ((member?.role ?? "") !== "owner") return apiJson(req, { ok: false, error: "NOT_ALLOWED" }, { status: 403 });

    const { data: players } = await supabase
      .from("players")
      .select("id,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .returns<PlayerRow[]>();

    const nextOwner = (players ?? []).find((p) => p.id !== playerId) ?? null;

    // If no one else is in the room, close it completely.
    if (!nextOwner) {
      await supabase.from("player_challenges").delete().eq("player_id", playerId);
      await supabase.from("room_members").delete().eq("room_id", roomId);
      await supabase.from("players").delete().eq("id", playerId);
      await supabase.from("room_settings").delete().eq("room_id", roomId);
      await supabase.from("rooms").delete().eq("id", roomId);
      return apiJson(req, { ok: true, closed: true });
    }

    const nowIso = new Date().toISOString();

    // Transfer leadership and mark owner as left (best effort).
    await supabase
      .from("room_members")
      .update({ role: "member", left_at: nowIso, points_at_leave: playerPoints, nickname_at_join: playerNickname })
      .eq("room_id", roomId)
      .eq("player_id", playerId);
    await supabase.from("room_members").update({ role: "owner" }).eq("room_id", roomId).eq("player_id", nextOwner.id);
    await supabase.from("rooms").update({ created_by_player_id: nextOwner.id }).eq("id", roomId);

    // Detach player from room (keep device identity).
    const { error: detachError } = await supabase.from("players").update({ room_id: null, nickname: playerNickname }).eq("id", playerId);
    if (detachError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });

    return apiJson(req, { ok: true, newOwnerId: nextOwner.id });
  } catch {
    // Fallback: always try to detach user so app can leave the game screen.
    const { error: detachError } = await supabase.from("players").update({ room_id: null, nickname: playerNickname }).eq("id", playerId);
    if (detachError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });
    return apiJson(req, { ok: true, degraded: true });
  }
}


