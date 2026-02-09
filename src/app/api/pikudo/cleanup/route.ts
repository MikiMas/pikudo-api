import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET_RETOS = "retos";
const BUCKET_CHALLENGE_MEDIA = "challenge-media";
const IN_FILTER_CHUNK_SIZE = 100;
const STORAGE_REMOVE_CHUNK_SIZE = 100;

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
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const next = value.trim();
    if (!next) continue;
    out.add(next);
  }
  return Array.from(out);
}

function parseTime(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

async function selectMembersByRoomIds(
  supabase: ReturnType<typeof supabaseAdmin>,
  roomIds: string[]
): Promise<{ data: RoomMemberRow[]; error: string | null }> {
  const all: RoomMemberRow[] = [];
  for (const batch of chunkArray(roomIds, IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("room_members")
      .select("room_id,player_id")
      .in("room_id", batch)
      .returns<RoomMemberRow[]>();
    if (error) return { data: [], error: error.message };
    all.push(...(data ?? []));
  }
  return { data: all, error: null };
}

async function selectPlayersByIds(
  supabase: ReturnType<typeof supabaseAdmin>,
  playerIds: string[]
): Promise<{ data: PlayerRow[]; error: string | null }> {
  if (playerIds.length === 0) return { data: [], error: null };
  const all: PlayerRow[] = [];
  for (const batch of chunkArray(playerIds, IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("players")
      .select("id,room_id")
      .in("id", batch)
      .returns<PlayerRow[]>();
    if (error) return { data: [], error: error.message };
    all.push(...(data ?? []));
  }
  return { data: all, error: null };
}

async function selectMembershipsByPlayerIds(
  supabase: ReturnType<typeof supabaseAdmin>,
  playerIds: string[]
): Promise<{ data: RoomMemberRow[]; error: string | null }> {
  if (playerIds.length === 0) return { data: [], error: null };
  const all: RoomMemberRow[] = [];
  for (const batch of chunkArray(playerIds, IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("room_members")
      .select("room_id,player_id")
      .in("player_id", batch)
      .returns<RoomMemberRow[]>();
    if (error) return { data: [], error: error.message };
    all.push(...(data ?? []));
  }
  return { data: all, error: null };
}

async function selectPlayerChallengesByPlayerIds(
  supabase: ReturnType<typeof supabaseAdmin>,
  playerIds: string[]
): Promise<{ data: PlayerChallengeRow[]; error: string | null }> {
  if (playerIds.length === 0) return { data: [], error: null };
  const all: PlayerChallengeRow[] = [];
  for (const batch of chunkArray(playerIds, IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("player_challenges")
      .select("id,player_id,block_start,media_path,media_url")
      .in("player_id", batch)
      .returns<PlayerChallengeRow[]>();
    if (error) return { data: [], error: error.message };
    all.push(...(data ?? []));
  }
  return { data: all, error: null };
}

async function removeStoragePaths(
  supabase: ReturnType<typeof supabaseAdmin>,
  bucket: string,
  paths: string[]
): Promise<string | null> {
  const deduped = unique(paths);
  for (const batch of chunkArray(deduped, STORAGE_REMOVE_CHUNK_SIZE)) {
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) return error.message;
  }
  return null;
}

async function deletePlayerChallengesByIds(
  supabase: ReturnType<typeof supabaseAdmin>,
  ids: string[]
): Promise<string | null> {
  for (const batch of chunkArray(unique(ids), IN_FILTER_CHUNK_SIZE)) {
    const { error } = await supabase.from("player_challenges").delete().in("id", batch);
    if (error) return error.message;
  }
  return null;
}

async function updatePlayersRoomNullByIds(
  supabase: ReturnType<typeof supabaseAdmin>,
  ids: string[]
): Promise<string | null> {
  for (const batch of chunkArray(unique(ids), IN_FILTER_CHUNK_SIZE)) {
    const { error } = await supabase.from("players").update({ room_id: null }).in("id", batch);
    if (error) return error.message;
  }
  return null;
}

async function deletePlayersByIds(
  supabase: ReturnType<typeof supabaseAdmin>,
  ids: string[]
): Promise<string | null> {
  for (const batch of chunkArray(unique(ids), IN_FILTER_CHUNK_SIZE)) {
    const { error } = await supabase.from("players").delete().in("id", batch);
    if (error) return error.message;
  }
  return null;
}

export async function POST(req: Request) {
  try {
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
    if (roomsError) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "load_rooms", detail: roomsError.message }, { status: 500 });
    }

    const roomRows = rooms ?? [];
    const roomIds = unique(roomRows.map((r) => r.id));
    if (roomIds.length === 0) {
      return apiJson(req, { ok: true, deletedRooms: 0, deletedPlayerChallenges: 0, deletedPlayers: 0 });
    }

    const roomIdSet = new Set(roomIds);
    const roomById = new Map(roomRows.map((r) => [r.id, r]));

    const membersResult = await selectMembersByRoomIds(supabase, roomIds);
    if (membersResult.error) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "load_members", detail: membersResult.error }, { status: 500 });
    }

    const memberRows = membersResult.data;
    const memberPlayerIds = unique(memberRows.map((m) => m.player_id));
    const roomIdsByPlayer = new Map<string, string[]>();
    for (const m of memberRows) {
      const list = roomIdsByPlayer.get(m.player_id) ?? [];
      list.push(m.room_id);
      roomIdsByPlayer.set(m.player_id, list);
    }

    const playersResult = await selectPlayersByIds(supabase, memberPlayerIds);
    if (playersResult.error) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "load_players", detail: playersResult.error }, { status: 500 });
    }
    const players = playersResult.data;

    const membershipsResult = await selectMembershipsByPlayerIds(supabase, memberPlayerIds);
    if (membershipsResult.error) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "load_memberships", detail: membershipsResult.error }, { status: 500 });
    }

    const hasOutsideMembership = new Set<string>();
    for (const m of membershipsResult.data) {
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

    const pcsResult = await selectPlayerChallengesByPlayerIds(supabase, memberPlayerIds);
    if (pcsResult.error) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "load_player_challenges", detail: pcsResult.error }, { status: 500 });
    }

    const pcsToDelete: PlayerChallengeRow[] = [];
    for (const pc of pcsResult.data) {
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

    const removeRetosError = await removeStoragePaths(supabase, BUCKET_RETOS, retosPaths);
    if (removeRetosError) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "remove_storage_retos", detail: removeRetosError }, { status: 500 });
    }

    const removeChallengeMediaError = await removeStoragePaths(supabase, BUCKET_CHALLENGE_MEDIA, challengeMediaPaths);
    if (removeChallengeMediaError) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "remove_storage_challenge_media", detail: removeChallengeMediaError }, { status: 500 });
    }

    const deleteChallengesError = await deletePlayerChallengesByIds(supabase, pcIdsToDelete);
    if (deleteChallengesError) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "delete_player_challenges", detail: deleteChallengesError }, { status: 500 });
    }

    const { error: deleteMembersError } = await supabase.from("room_members").delete().in("room_id", roomIds);
    if (deleteMembersError) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "delete_room_members", detail: deleteMembersError.message }, { status: 500 });
    }

    const detachPlayersError = await updatePlayersRoomNullByIds(supabase, playersToDetach);
    if (detachPlayersError) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "detach_players", detail: detachPlayersError }, { status: 500 });
    }

    const deletePlayersError = await deletePlayersByIds(supabase, playersToDelete);
    if (deletePlayersError) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "delete_players", detail: deletePlayersError }, { status: 500 });
    }

    const { error: deleteSettingsError } = await supabase.from("room_settings").delete().in("room_id", roomIds);
    if (deleteSettingsError) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "delete_room_settings", detail: deleteSettingsError.message }, { status: 500 });
    }

    const { error: deleteRoomsError } = await supabase.from("rooms").delete().in("id", roomIds);
    if (deleteRoomsError) {
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step: "delete_rooms", detail: deleteRoomsError.message }, { status: 500 });
    }

    return apiJson(req, {
      ok: true,
      deletedRooms: roomIds.length,
      deletedPlayerChallenges: pcIdsToDelete.length,
      deletedPlayers: playersToDelete.length
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "UNKNOWN";
    return apiJson(req, { ok: false, error: "CLEANUP_FAILED", detail }, { status: 500 });
  }
}
