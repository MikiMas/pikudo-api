import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ROUND_MS = 30 * 60 * 1000;

type RoomRow = {
  id: string;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  rounds: number | null;
};

type RoomSettingsRow = { game_started_at: string | null };

export type FinalRoomWindow = {
  exists: boolean;
  ended: boolean;
  status: string;
  startedAtIso: string | null;
  endsAtIso: string | null;
};

function parseIsoDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export async function getFinalRoomWindow(
  supabase: ReturnType<typeof supabaseAdmin>,
  roomId: string
): Promise<FinalRoomWindow> {
  const now = new Date();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id,status,starts_at,ends_at,rounds")
    .eq("id", roomId)
    .maybeSingle<RoomRow>();

  if (roomError || !room) {
    return { exists: false, ended: false, status: "", startedAtIso: null, endsAtIso: null };
  }

  const status = String(room.status ?? "").toLowerCase();
  const rounds = Math.min(10, Math.max(1, Math.floor(room.rounds ?? 1)));

  const { data: settings } = await supabase
    .from("room_settings")
    .select("game_started_at")
    .eq("room_id", roomId)
    .maybeSingle<RoomSettingsRow>();

  const startedAt =
    parseIsoDate(settings?.game_started_at ?? null) ??
    parseIsoDate(room.starts_at ?? null);

  const scheduledEndsAt = startedAt ? new Date(startedAt.getTime() + rounds * ROUND_MS) : null;
  const explicitEndsAt = parseIsoDate(room.ends_at ?? null);
  const endsAt = explicitEndsAt ?? scheduledEndsAt;

  const endedByStatus = status === "ended";
  const endedByTime = endsAt ? now.getTime() >= endsAt.getTime() : false;

  return {
    exists: true,
    ended: endedByStatus || endedByTime,
    status,
    startedAtIso: startedAt ? startedAt.toISOString() : null,
    endsAtIso: endsAt ? endsAt.toISOString() : null
  };
}

