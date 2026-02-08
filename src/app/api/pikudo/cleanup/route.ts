import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET_RETOS = "retos";
const BUCKET_CHALLENGE_MEDIA = "challenge-media";

type RoomRow = { id: string; starts_at: string | null; ends_at: string | null };
type RoomMemberRow = { room_id: string; player_id: string };
type PlayerRow = { id: string; room_id: string | null };
type PlayerChallengeRow = {
  id: string;
  player_id: string;
  block_start: string | null;
  media_path: string | null;
  media_url: string | null;
};

function pathFromPublicStorageUrl(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    const markerPublic = `/storage/v1/object/public/${bucket}/`;
    const markerSign = `/storage/v1/object/sign/${bucket}/`;
    const idxPublic = u.pathname.indexOf(markerPublic);
    if (idxPublic !== -1) return decodeURIComponent(u.pathname.slice(idxPublic + markerPublic.length));
    const idxSign = u.pathname.indexOf(markerSign);
    if (idxSign !== -1) {
      const rest = u.pathname.slice(idxSign + markerSign.length);
      const withoutLeading = rest.startsWith("/") ? rest.slice(1) : rest;
      const nextSlash = withoutLeading.indexOf("/");
      return decodeURIComponent(nextSlash === -1 ? withoutLeading : withoutLeading.slice(nextSlash + 1));
    }
    return null;
  } catch {
    return null;
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => typeof v === "string" && v.trim())));
}

function parseTime(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

export async function POST(req: Request) {
  const supabase = supabaseAdmin();
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id,starts_at,ends_at")
    .eq("status", "ended")
    .not("ends_at", "is", null)
    .lte("ends_at", cutoffIso)
    .limit(200)
    .returns<RoomRow[]>();
  if (roomsError) return apiJson(req, { ok: false, error: roomsError.message }, { status: 500 });

  const roomRows = rooms ?? [];
  const roomIds = unique(roomRows.map((r) => r.id));
  if (roomIds.length === 0) {
    return apiJson(req, { ok: true, deletedRooms: 0, deletedPlayerChallenges: 0, deletedPlayers: 0 });
  }

  const roomIdSet = new Set(roomIds);
  const roomById = new Map(roomRows.map((r) => [r.id, r]));

  const { data: members, error: membersError } = await supabase
    .from("room_members")
    .select("room_id,player_id")
    .in("room_id", roomIds)
    .returns<RoomMemberRow[]>();
  if (membersError) return apiJson(req, { ok: false, error: membersError.message }, { status: 500 });

  const memberRows = members ?? [];
  const memberPlayerIds = unique(memberRows.map((m) => m.player_id));
  const roomIdsByPlayer = new Map<string, string[]>();
  for (const m of memberRows) {
    const list = roomIdsByPlayer.get(m.player_id) ?? [];
    list.push(m.room_id);
    roomIdsByPlayer.set(m.player_id, list);
  }

  const playersResult =
    memberPlayerIds.length === 0
      ? { data: [] as PlayerRow[], error: null as { message: string } | null }
      : await supabase.from("players").select("id,room_id").in("id", memberPlayerIds).returns<PlayerRow[]>();
  if (playersResult.error) return apiJson(req, { ok: false, error: playersResult.error.message }, { status: 500 });
  const players = playersResult.data ?? [];

  const membershipsResult =
    memberPlayerIds.length === 0
      ? { data: [] as RoomMemberRow[], error: null as { message: string } | null }
      : await supabase.from("room_members").select("room_id,player_id").in("player_id", memberPlayerIds).returns<RoomMemberRow[]>();
  if (membershipsResult.error) return apiJson(req, { ok: false, error: membershipsResult.error.message }, { status: 500 });

  const hasOutsideMembership = new Set<string>();
  for (const m of membershipsResult.data ?? []) {
    if (!roomIdSet.has(m.room_id)) hasOutsideMembership.add(m.player_id);
  }

  const playersToDelete = unique(
    players
      .filter((p) => !hasOutsideMembership.has(p.id))
      .filter((p) => !p.room_id || roomIdSet.has(p.room_id))
      .map((p) => p.id)
  );
  const playersToDetach = unique(
    players
      .filter((p) => hasOutsideMembership.has(p.id))
      .filter((p) => Boolean(p.room_id) && roomIdSet.has(p.room_id as string))
      .map((p) => p.id)
  );
  const playersToDeleteSet = new Set(playersToDelete);

  const pcsResult =
    memberPlayerIds.length === 0
      ? { data: [] as PlayerChallengeRow[], error: null as { message: string } | null }
      : await supabase
          .from("player_challenges")
          .select("id,player_id,block_start,media_path,media_url")
          .in("player_id", memberPlayerIds)
          .returns<PlayerChallengeRow[]>();
  if (pcsResult.error) return apiJson(req, { ok: false, error: pcsResult.error.message }, { status: 500 });

  const pcsToDelete: PlayerChallengeRow[] = [];
  for (const pc of pcsResult.data ?? []) {
    if (playersToDeleteSet.has(pc.player_id)) {
      pcsToDelete.push(pc);
      continue;
    }

    const relatedRooms = roomIdsByPlayer.get(pc.player_id) ?? [];
    const pcTs = parseTime(pc.block_start);

    let shouldDelete = false;
    for (const roomId of relatedRooms) {
      const room = roomById.get(roomId);
      if (!room) continue;
      const startTs = parseTime(room.starts_at);
      const endTs = parseTime(room.ends_at);
      if (Number.isFinite(pcTs) && Number.isFinite(startTs) && Number.isFinite(endTs) && pcTs >= startTs && pcTs <= endTs) {
        shouldDelete = true;
        break;
      }
    }

    if (!shouldDelete && relatedRooms.length === 1 && !Number.isFinite(pcTs)) {
      // Conservative fallback when block_start is missing/invalid.
      shouldDelete = true;
    }

    if (shouldDelete) pcsToDelete.push(pc);
  }

  const pcIdsToDelete = unique(pcsToDelete.map((pc) => pc.id));

  const retosPaths: string[] = [];
  const challengeMediaPaths: string[] = [];
  for (const pc of pcsToDelete) {
    if (pc.media_path) challengeMediaPaths.push(pc.media_path);
    if (pc.media_url) {
      const p = pathFromPublicStorageUrl(pc.media_url, BUCKET_RETOS);
      if (p) retosPaths.push(p);
    }
  }

  if (retosPaths.length) await supabase.storage.from(BUCKET_RETOS).remove(retosPaths);
  if (challengeMediaPaths.length) await supabase.storage.from(BUCKET_CHALLENGE_MEDIA).remove(challengeMediaPaths);

  if (pcIdsToDelete.length) await supabase.from("player_challenges").delete().in("id", pcIdsToDelete);
  await supabase.from("room_members").delete().in("room_id", roomIds);

  if (playersToDetach.length) {
    await supabase.from("players").update({ room_id: null }).in("id", playersToDetach);
  }
  if (playersToDelete.length) {
    await supabase.from("players").delete().in("id", playersToDelete);
  }

  await supabase.from("room_settings").delete().in("room_id", roomIds);
  await supabase.from("rooms").delete().in("id", roomIds);

  return apiJson(req, {
    ok: true,
    deletedRooms: roomIds.length,
    deletedPlayerChallenges: pcIdsToDelete.length,
    deletedPlayers: playersToDelete.length
  });
}

