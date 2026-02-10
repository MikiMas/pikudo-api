import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromSession } from "@/app/api/pikudo/_lib/sessionPlayer";
import { validateUuid } from "@/app/api/pikudo/_lib/validators";

export const runtime = "nodejs";

type LeaderRow = { nickname: string; points: number };
type CachedLeaders = { at: number; leaders: LeaderRow[] };

// Small in-memory cache to collapse bursty polling from multiple devices.
const leadersCacheByRoom = new Map<string, CachedLeaders>();
const LEADERS_CACHE_TTL_MS = 1500;

function getCachedLeaders(roomId: string): LeaderRow[] | null {
  const cached = leadersCacheByRoom.get(roomId);
  if (!cached) return null;
  if (Date.now() - cached.at > LEADERS_CACHE_TTL_MS) {
    leadersCacheByRoom.delete(roomId);
    return null;
  }
  return cached.leaders;
}

function setCachedLeaders(roomId: string, leaders: LeaderRow[]): void {
  leadersCacheByRoom.set(roomId, { at: Date.now(), leaders });
  if (leadersCacheByRoom.size > 2000) {
    const now = Date.now();
    for (const [key, value] of leadersCacheByRoom) {
      if (now - value.at > LEADERS_CACHE_TTL_MS * 4) leadersCacheByRoom.delete(key);
    }
  }
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    let roomId = "";
    try {
      const { player } = await requirePlayerFromSession(req);
      roomId = player.room_id;
      if (!validateUuid(roomId)) {
        return apiJson(req, { ok: false, error: "NO_ROOM" }, { status: 400 });
      }
    } catch {
      return apiJson(req, { ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const cached = getCachedLeaders(roomId);
    if (cached) return apiJson(req, { ok: true, leaders: cached });

    const { data, error } = await supabase
      .from("players")
      .select("nickname,points")
      .eq("room_id", roomId)
      .order("points", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(50)
      .returns<LeaderRow[]>();

    if (error) {
      return apiJson(req, { ok: false, error: "LEADERBOARD_FAILED" }, { status: 500 });
    }

    const leaders = data ?? [];
    setCachedLeaders(roomId, leaders);
    return apiJson(req, { ok: true, leaders });
  } catch {
    return apiJson(req, { ok: false, error: "REQUEST_FAILED" }, { status: 500 });
  }
}
