import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET_RETOS = "retos";
const IN_FILTER_CHUNK_SIZE = 100;
const STORAGE_REMOVE_CHUNK_SIZE = 100;

type RoomRow = { id: string; status: string | null; starts_at: string | null; ends_at: string | null };
type RoomMemberRow = { room_id: string; player_id: string };
type PlayerRow = { id: string; room_id: string | null };
type PlayerChallengeRow = {
  id: string;
  player_id: string;
  block_start: string | null;
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

async function selectPlayersByRoomIds(
  supabase: ReturnType<typeof supabaseAdmin>,
  roomIds: string[]
): Promise<{ data: PlayerRow[]; error: string | null }> {
  if (roomIds.length === 0) return { data: [], error: null };
  const all: PlayerRow[] = [];
  for (const batch of chunkArray(roomIds, IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("players")
      .select("id,room_id")
      .in("room_id", batch)
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
      .select("id,player_id,block_start,media_url")
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

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const runId = `cln_${Date.now().toString(36)}`;
    const log = (step: string, extra?: Record<string, unknown>) => {
      if (extra) {
        console.log("[PIKUDO_CLEANUP]", runId, step, JSON.stringify(extra));
        return;
      }
      console.log("[PIKUDO_CLEANUP]", runId, step);
    };
    const fail = (step: string, detail: string) => {
      console.error("[PIKUDO_CLEANUP][ERROR]", runId, step, detail);
      return apiJson(req, { ok: false, error: "CLEANUP_FAILED", step, detail, runId }, { status: 500 });
    };

    const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    log("start", { cutoffIso });

    const { data: rooms, error: roomsError } = await supabase
      .from("rooms")
      .select("id,status,starts_at,ends_at")
      .not("ends_at", "is", null)
      .lte("ends_at", cutoffIso)
      .limit(200)
      .returns<RoomRow[]>();
    if (roomsError) return fail("load_rooms", roomsError.message);

    const roomRows = rooms ?? [];
    const roomIds = unique(roomRows.map((r) => r.id));
    const roomsByStatus = roomRows.reduce<Record<string, number>>((acc, room) => {
      const status = String(room.status ?? "unknown").toLowerCase();
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});
    log("load_rooms_ok", { rooms: roomIds.length, byStatus: roomsByStatus });
    if (roomIds.length === 0) {
      log("nothing_to_cleanup");
      return apiJson(req, { ok: true, deletedRooms: 0, deletedPlayerChallenges: 0, deletedPlayers: 0, runId });
    }

    const roomIdSet = new Set(roomIds);
    const roomById = new Map(roomRows.map((r) => [r.id, r]));

    const membersResult = await selectMembersByRoomIds(supabase, roomIds);
    if (membersResult.error) return fail("load_members", membersResult.error);

    const memberRows = membersResult.data;
    const memberPlayerIds = unique(memberRows.map((m) => m.player_id));
    log("load_members_ok", { members: memberRows.length, players: memberPlayerIds.length });
    const roomIdsByPlayer = new Map<string, string[]>();
    for (const m of memberRows) {
      const list = roomIdsByPlayer.get(m.player_id) ?? [];
      list.push(m.room_id);
      roomIdsByPlayer.set(m.player_id, list);
    }

    const playersResult = await selectPlayersByIds(supabase, memberPlayerIds);
    if (playersResult.error) return fail("load_players", playersResult.error);
    const players = playersResult.data;

    const membershipsResult = await selectMembershipsByPlayerIds(supabase, memberPlayerIds);
    if (membershipsResult.error) return fail("load_memberships", membershipsResult.error);

    const playersByRoomResult = await selectPlayersByRoomIds(supabase, roomIds);
    if (playersByRoomResult.error) return fail("load_players_by_room", playersByRoomResult.error);
    const playersToDetach = unique(playersByRoomResult.data.map((p) => p.id));
    log("players_resolution", {
      playersLoaded: players.length,
      toDetach: playersToDetach.length,
      toDelete: 0
    });

    const pcsResult = await selectPlayerChallengesByPlayerIds(supabase, memberPlayerIds);
    if (pcsResult.error) return fail("load_player_challenges", pcsResult.error);

    const pcsToDelete: PlayerChallengeRow[] = [];
    for (const pc of pcsResult.data) {
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
    log("player_challenges_resolution", { loaded: pcsResult.data.length, toDelete: pcIdsToDelete.length });

    const retosPaths: string[] = [];
    for (const pc of pcsToDelete) {
      if (pc.media_url) {
        const retosPath = pathFromPublicStorageUrl(pc.media_url, BUCKET_RETOS);
        if (retosPath) retosPaths.push(retosPath);
      }
    }

    const removeRetosError = await removeStoragePaths(supabase, BUCKET_RETOS, retosPaths);
    if (removeRetosError) return fail("remove_storage_retos", removeRetosError);
    log("storage_cleanup_ok", { retosPaths: retosPaths.length });

    const deleteChallengesError = await deletePlayerChallengesByIds(supabase, pcIdsToDelete);
    if (deleteChallengesError) return fail("delete_player_challenges", deleteChallengesError);

    const { error: deleteMembersError } = await supabase.from("room_members").delete().in("room_id", roomIds);
    if (deleteMembersError) return fail("delete_room_members", deleteMembersError.message);

    const detachPlayersError = await updatePlayersRoomNullByIds(supabase, playersToDetach);
    if (detachPlayersError) return fail("detach_players", detachPlayersError);
    log("db_cleanup_ok", { roomMembersDeleted: roomIds.length, playersDetached: playersToDetach.length, playersDeleted: 0 });

    const { error: deleteSettingsError } = await supabase.from("room_settings").delete().in("room_id", roomIds);
    if (deleteSettingsError) return fail("delete_room_settings", deleteSettingsError.message);

    const { error: deleteRoomsError } = await supabase.from("rooms").delete().in("id", roomIds);
    if (deleteRoomsError) return fail("delete_rooms", deleteRoomsError.message);

    log("done", {
      deletedRooms: roomIds.length,
      deletedPlayerChallenges: pcIdsToDelete.length,
      deletedPlayers: 0
    });
    return apiJson(req, {
      ok: true,
      deletedRooms: roomIds.length,
      deletedPlayerChallenges: pcIdsToDelete.length,
      deletedPlayers: 0,
      runId
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "UNKNOWN";
    console.error("[PIKUDO_CLEANUP][ERROR]", "fatal", detail);
    return apiJson(req, { ok: false, error: "CLEANUP_FAILED", detail }, { status: 500 });
  }
}
