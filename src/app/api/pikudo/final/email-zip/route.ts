import { NextResponse } from "next/server";
import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlayerFromDevice } from "@/app/api/pikudo/_lib/sessionPlayer";
import { createZipStore } from "@/app/api/pikudo/_lib/zip";
import { validateUuid } from "@/app/api/pikudo/_lib/validators";
import { getFinalRoomWindow } from "@/app/api/pikudo/final/_lib/roomWindow";

export const runtime = "nodejs";

type MediaRow = { media_url: string | null; media_mime: string | null; media_type: string | null; player_id: string };
type PlayerRow = { id: string; nickname: string };
type RoomMemberRow = { player_id: string; nickname_at_join: string | null };

const attemptsByDevice = new Map<string, number>();
const MAX_ATTEMPTS = 2;

function cleanupAttemptsMap() {
  if (attemptsByDevice.size <= 25_000) return;
  for (const [k, v] of attemptsByDevice) {
    if (v >= MAX_ATTEMPTS) attemptsByDevice.delete(k);
  }
}

function isValidEmail(email: string): boolean {
  const v = email.trim();
  if (!v) return false;
  if (v.length > 200) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function extFromMime(mime: string | null): string {
  const m = (mime ?? "").toLowerCase();
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "image/heic") return "heic";
  return "bin";
}

function safeFileName(input: string): string {
  return input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export async function POST(req: Request) {
  const supabase = supabaseAdmin();
  let roomId = "";
  let deviceId = "";

  try {
    const authed = await requirePlayerFromDevice(req);
    roomId = authed.player.room_id;
    deviceId = authed.deviceId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNAUTHORIZED";
    return apiJson(req, { ok: false, error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }

  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!isValidEmail(email)) return apiJson(req, { ok: false, error: "INVALID_EMAIL" }, { status: 400 });

  cleanupAttemptsMap();
  const attempts = attemptsByDevice.get(deviceId) ?? 0;
  if (attempts >= MAX_ATTEMPTS) return apiJson(req, { ok: false, error: "TOO_MANY_ATTEMPTS" }, { status: 429 });

  if (!validateUuid(roomId)) return apiJson(req, { ok: false, error: "NO_ROOM" }, { status: 400 });
  const roomWindow = await getFinalRoomWindow(supabase, roomId);
  if (!roomWindow.exists) return apiJson(req, { ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });
  if (!roomWindow.ended) return apiJson(req, { ok: false, error: "GAME_NOT_ENDED" }, { status: 400 });
  if (!roomWindow.startedAtIso || !roomWindow.endsAtIso) {
    return apiJson(req, { ok: false, error: "ROOM_WINDOW_INVALID" }, { status: 500 });
  }

  const webhookUrl = process.env.EMAIL_ZIP_WEBHOOK_URL ?? "";
  if (!webhookUrl) return apiJson(req, { ok: false, error: "EMAIL_NOT_CONFIGURED" }, { status: 500 });

  const { data: room } = await supabase.from("rooms").select("code").eq("id", roomId).maybeSingle<{ code: string }>();

  const { data: members, error: membersError } = await supabase
    .from("room_members")
    .select("player_id,nickname_at_join")
    .eq("room_id", roomId)
    .limit(500)
    .returns<RoomMemberRow[]>();

  if (membersError) return apiJson(req, { ok: false, error: membersError.message }, { status: 500 });
  const playerIds = (members ?? []).map((m) => m.player_id);
  if (playerIds.length === 0) return apiJson(req, { ok: false, error: "NO_PLAYERS" }, { status: 404 });

  const { data: playersInRoom, error: playersError } = await supabase
    .from("players")
    .select("id,nickname")
    .in("id", playerIds)
    .returns<PlayerRow[]>();

  if (playersError) return apiJson(req, { ok: false, error: playersError.message }, { status: 500 });

  const { data: mediaRows, error: mediaError } =
    playerIds.length === 0
      ? { data: [] as MediaRow[] }
      : await supabase
          .from("player_challenges")
          .select("player_id,media_url,media_mime,media_type")
          .in("player_id", playerIds)
          .eq("completed", true)
          .not("media_url", "is", null)
          .gte("block_start", roomWindow.startedAtIso)
          .lt("block_start", roomWindow.endsAtIso)
          .returns<MediaRow[]>();

  if (mediaError) return apiJson(req, { ok: false, error: mediaError.message }, { status: 500 });

  const images = (mediaRows ?? []).filter((r) => r.media_type === "image" && typeof r.media_url === "string" && r.media_url);
  if (images.length === 0) return apiJson(req, { ok: false, error: "NO_IMAGES" }, { status: 404 });

  const nickById = new Map((playersInRoom ?? []).map((p) => [p.id, p.nickname]));
  for (const m of members ?? []) {
    if (m.nickname_at_join) nickById.set(m.player_id, m.nickname_at_join);
  }

  const MAX_FILES = 400;
  const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

  const files: { name: string; data: Uint8Array }[] = [];
  let totalBytes = 0;

  for (const [idx, r] of images.slice(0, MAX_FILES).entries()) {
    const url = r.media_url as string;
    const mime = r.media_mime ?? "application/octet-stream";
    const ext = extFromMime(r.media_mime);
    const nick = safeFileName(nickById.get(r.player_id) ?? r.player_id.slice(0, 8));
    const filename = `${nick}/img_${String(idx + 1).padStart(3, "0")}.${ext}`;

    const resp = await fetch(url);
    if (!resp.ok) continue;
    const buf = new Uint8Array(await resp.arrayBuffer());
    totalBytes += buf.length;
    if (totalBytes > MAX_TOTAL_BYTES) break;
    files.push({ name: filename, data: buf });
  }

  if (files.length === 0) return apiJson(req, { ok: false, error: "NO_DOWNLOADABLE_IMAGES" }, { status: 404 });

  const zipBytes = createZipStore(files);
  const zipBase64 = Buffer.from(zipBytes).toString("base64");
  const zipName = `pikudo_${safeFileName(room?.code ?? "room")}_imagenes.zip`;

  const token = process.env.EMAIL_ZIP_WEBHOOK_TOKEN ?? "";
  const hookRes = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      to: email,
      subject: "PIKUDO - ImÃ¡genes de la partida",
      text: "Adjunto tienes el ZIP con las imÃ¡genes de la partida.",
      attachment: { filename: zipName, mime: "application/zip", contentBase64: zipBase64 }
    })
  });

  if (!hookRes.ok) {
    const errText = await hookRes.text().catch(() => "");
    return apiJson(req, { ok: false, error: `EMAIL_SEND_FAILED${errText ? `: ${errText}` : ""}` }, { status: 502 });
  }

  attemptsByDevice.set(deviceId, attempts + 1);

  return apiJson(req, { ok: true, sentTo: email });
}


