import { NextResponse } from "next/server";`r`nimport { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateRoomCode } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.toUpperCase();
  if (!validateRoomCode(code)) return apiJson(req, { ok: false, error: "INVALID_ROOM_CODE" }, { status: 400 });

  const supabase = supabaseAdmin();
  // Use `*` to avoid failing on schema differences (e.g. missing optional columns).
  const { data, error } = await supabase.from("rooms").select("*").eq("code", code).maybeSingle();

  if (error) return apiJson(req, { ok: false, error: error.message }, { status: 500 });
  if (!data) return apiJson(req, { ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });
  return apiJson(req, { ok: true, room: data });
}

