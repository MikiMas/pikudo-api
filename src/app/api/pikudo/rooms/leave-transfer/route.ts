import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";

export const runtime = "nodejs";

type PlayerRow = { id: string; created_at?: string | null };

export async function POST(req: Request) {
  try {
    const authed = await requirePlayerFromSession(req);
    const playerId = authed.player.id;
    const playerNickname = authed.player.nickname;
    const playerPoints = authed.player.points ?? 0;

    const supabase = supabaseAdmin();

    const { data: member, error: memberError } = await supabase
      .from("room_members")
      .select("room_id,role")
      .eq("player_id", playerId)
      .maybeSingle<{ room_id: string; role: string }>();
    if (memberError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });

    if (!member?.room_id) return apiJson(req, { ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });
    if (member.role !== "owner") return apiJson(req, { ok: false, error: "NOT_ALLOWED" }, { status: 403 });

    const roomId = member.room_id;

    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .returns<PlayerRow[]>();
    if (playersError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });

    const nextOwner = (players ?? []).find((p) => p.id !== playerId) ?? null;

    // If no one else is in the room, close it completely.
    if (!nextOwner) {
      const { error: deletePcError } = await supabase.from("player_challenges").delete().eq("player_id", playerId);
      if (deletePcError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });
      const { error: deleteMembersError } = await supabase.from("room_members").delete().eq("room_id", roomId);
      if (deleteMembersError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });
      const { error: deletePlayerError } = await supabase.from("players").delete().eq("id", playerId);
      if (deletePlayerError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });
      const { error: deleteSettingsError } = await supabase.from("room_settings").delete().eq("room_id", roomId);
      if (deleteSettingsError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });
      const { error: deleteRoomError } = await supabase.from("rooms").delete().eq("id", roomId);
      if (deleteRoomError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });

      return apiJson(req, { ok: true, closed: true });
    }

    const nowIso = new Date().toISOString();

    // Transfer leadership and mark owner as left (keep media and challenges).
    const { error: demoteError } = await supabase
      .from("room_members")
      .update({ role: "member", left_at: nowIso, points_at_leave: playerPoints, nickname_at_join: playerNickname })
      .eq("room_id", roomId)
      .eq("player_id", playerId);
    if (demoteError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });
    const { error: promoteError } = await supabase
      .from("room_members")
      .update({ role: "owner" })
      .eq("room_id", roomId)
      .eq("player_id", nextOwner.id);
    if (promoteError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });
    const { error: roomOwnerError } = await supabase.from("rooms").update({ created_by_player_id: nextOwner.id }).eq("id", roomId);
    if (roomOwnerError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });

    // Detach player from room (keep device identity).
    const { error: detachError } = await supabase.from("players").update({ room_id: null, nickname: playerNickname }).eq("id", playerId);
    if (detachError) return apiJson(req, { ok: false, error: "LEAVE_FAILED" }, { status: 500 });

    return apiJson(req, { ok: true, newOwnerId: nextOwner.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "REQUEST_FAILED";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    const safeCode = msg === "UNAUTHORIZED" ? "UNAUTHORIZED" : "LEAVE_FAILED";
    return apiJson(req, { ok: false, error: safeCode }, { status });
  }
}


