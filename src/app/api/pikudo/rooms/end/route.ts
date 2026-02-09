import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateRoomCode } from "@/app/api/pikudo/_lib/validators";
import { requirePlayerFromDevice } from "@/app/api/pikudo/_lib/sessionPlayer";

export const runtime = "nodejs";

type Body = { code?: unknown };
type PlayerRow = { id: string; room_id: string };
type RoomRow = { id: string; code: string; status: string; ends_at: string | null };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const rawCode = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    const hasCode = Boolean(rawCode);
    if (hasCode && !validateRoomCode(rawCode)) {
      return apiJson(req, { ok: false, error: "INVALID_ROOM_CODE" }, { status: 400 });
    }

    let playerId = "";

    const authed = await requirePlayerFromDevice(req);
    playerId = authed.player.id;

    const supabase = supabaseAdmin();

    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("id,room_id")
      .eq("id", playerId)
      .maybeSingle<PlayerRow>();
    if (playerError) return apiJson(req, { ok: false, error: "END_FAILED" }, { status: 500 });
    if (!player?.room_id) return apiJson(req, { ok: false, error: "NO_ROOM" }, { status: 400 });

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id,code,status,ends_at")
      .eq("id", player.room_id)
      .maybeSingle<RoomRow>();
    if (roomError) return apiJson(req, { ok: false, error: "END_FAILED" }, { status: 500 });
    if (!room) return apiJson(req, { ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });
    if (hasCode && room.code !== rawCode) return apiJson(req, { ok: false, error: "ROOM_MISMATCH" }, { status: 403 });

    const { data: member, error: memberError } = await supabase
      .from("room_members")
      .select("role")
      .eq("room_id", room.id)
      .eq("player_id", player.id)
      .maybeSingle<{ role: string }>();
    if (memberError) return apiJson(req, { ok: false, error: "END_FAILED" }, { status: 500 });
    if ((member?.role ?? "") !== "owner") return apiJson(req, { ok: false, error: "NOT_ALLOWED" }, { status: 403 });

    if (String(room.status ?? "").toLowerCase() === "ended") {
      return apiJson(req, { ok: true, endedAt: room.ends_at ?? new Date().toISOString() });
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase.from("rooms").update({ status: "ended", ends_at: nowIso }).eq("id", room.id);
    if (updateError) return apiJson(req, { ok: false, error: "END_FAILED" }, { status: 500 });
    await supabase.from("room_settings").update({ game_status: "ended" }).eq("room_id", room.id);

    return apiJson(req, { ok: true, endedAt: nowIso });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "REQUEST_FAILED";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    const safeCode = msg === "UNAUTHORIZED" ? "UNAUTHORIZED" : "END_FAILED";
    return apiJson(req, { ok: false, error: safeCode }, { status });
  }
}



