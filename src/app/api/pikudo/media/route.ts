import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateUuid } from "@/app/api/pikudo/_lib/validators";
import { requirePlayerFromDevice } from "@/app/api/pikudo/_lib/sessionPlayer";

export const runtime = "nodejs";

const BUCKET = "challenge-media";

type PlayerChallengeRow = { id: string; player_id: string; media_path: string | null; media_mime: string | null };

export async function GET(req: Request) {
  let playerId = "";
  try {
    const authed = await requirePlayerFromDevice(req);
    playerId = authed.player.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNAUTHORIZED";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    return apiJson(req, { ok: false, error: msg }, { status });
  }

  const url = new URL(req.url);
  const playerChallengeId = url.searchParams.get("playerChallengeId");
  if (!validateUuid(playerChallengeId)) {
    return apiJson(req, { ok: false, error: "INVALID_PLAYER_CHALLENGE_ID" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: pc, error: pcError } = await supabase
    .from("player_challenges")
    .select("id,player_id,media_path,media_mime")
    .eq("id", playerChallengeId.trim())
    .maybeSingle<PlayerChallengeRow>();

  if (pcError) return apiJson(req, { ok: false, error: pcError.message }, { status: 500 });
  if (!pc || pc.player_id !== playerId) return apiJson(req, { ok: false, error: "NOT_ALLOWED" }, { status: 403 });
  if (!pc.media_path) return apiJson(req, { ok: false, error: "NO_MEDIA" }, { status: 404 });

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pc.media_path, 60 * 10);
  if (error) return apiJson(req, { ok: false, error: error.message }, { status: 500 });

  return apiJson(req, { ok: true, url: data.signedUrl, mime: pc.media_mime });
}



