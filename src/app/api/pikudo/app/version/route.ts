import { apiJson } from "@/lib/apiJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type AppVersionGateRow = {
  id: boolean;
  revision_version: string;
  client_version: string;
};

export async function GET(req: Request) {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("app_version_gate")
    .select("id,revision_version,client_version")
    .eq("id", true)
    .maybeSingle<AppVersionGateRow>();

  if (error) return apiJson(req, { ok: false, error: "VERSION_CONFIG_READ_FAILED" }, { status: 500 });
  if (!data) return apiJson(req, { ok: false, error: "VERSION_CONFIG_NOT_FOUND" }, { status: 404 });

  const revisionVersion = String(data.revision_version ?? "").trim();
  const clientVersion = String(data.client_version ?? "").trim();

  if (!revisionVersion || !clientVersion) {
    return apiJson(req, { ok: false, error: "VERSION_CONFIG_INVALID" }, { status: 500 });
  }

  return apiJson(req, { ok: true, revisionVersion, clientVersion });
}

