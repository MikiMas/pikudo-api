import { randomUUID } from "crypto";

import { apiJson } from "@/lib/apiJson";
import { requireSumoUser } from "@/app/api/sumo/_lib/auth";
import { supabaseAdminForProject } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = process.env.SUPABASE_SUMO_MEDIA_BUCKET?.trim() || "files";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

const FOLDER_MAP = {
  "bike-main": "bikes/main",
  "bike-media": "bikes/media",
  "route-media": "routes/media",
  "profile-avatar": "profiles/avatar",
  "post-media": "posts/media",
  misc: "misc"
} as const;

type FolderKey = keyof typeof FOLDER_MAP;

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function extFromMime(mime: string): string {
  if (!mime.includes("/")) return "";
  const ext = mime.split("/")[1]?.toLowerCase() ?? "";
  if (!ext) return "";
  if (ext === "jpeg") return ".jpg";
  if (ext === "quicktime") return ".mov";
  return `.${ext}`;
}

function normalizeFolderKey(raw: FormDataEntryValue | null): FolderKey {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value && value in FOLDER_MAP) {
    return value as FolderKey;
  }
  return "misc";
}

function buildStoragePath(folderKey: FolderKey, userId: string, mime: string) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");

  const safeUserId = sanitizeSegment(userId);
  const folderPath = FOLDER_MAP[folderKey];
  const extension = extFromMime(mime) || ".bin";
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;

  return `sumo/${folderPath}/${safeUserId}/${yyyy}/${mm}/${dd}/${filename}`;
}

export async function POST(req: Request) {
  try {
    const user = await requireSumoUser(req);
    const form = await req.formData().catch(() => null);
    if (!form) {
      return apiJson(req, { ok: false, error: "INVALID_FORM" }, { status: 400 });
    }

    const file = form.get("file");
    const folderKey = normalizeFolderKey(form.get("folder"));

    if (!(file instanceof File)) {
      return apiJson(req, { ok: false, error: "MISSING_FILE" }, { status: 400 });
    }

    const mime = file.type || "application/octet-stream";
    const isImage = mime.startsWith("image/");
    const isVideo = mime.startsWith("video/");

    if (!isImage && !isVideo) {
      return apiJson(req, { ok: false, error: "ONLY_IMAGE_OR_VIDEO_ALLOWED" }, { status: 400 });
    }

    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) {
      return apiJson(req, { ok: false, error: "FILE_TOO_LARGE" }, { status: 400 });
    }

    const path = buildStoragePath(folderKey, user.id, mime);
    const bytes = new Uint8Array(await file.arrayBuffer());

    const supabase = supabaseAdminForProject("sumo");
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime,
      upsert: false
    });

    if (uploadError) {
      return apiJson(
        req,
        {
          ok: false,
          error: uploadError.message,
          hint: `Crea el bucket '${BUCKET}' en Supabase Storage.`
        },
        { status: 500 }
      );
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return apiJson(
      req,
      {
        ok: true,
        file: {
          bucket: BUCKET,
          folder: folderKey,
          path,
          url: publicUrl,
          mime,
          kind: isVideo ? "video" : "image"
        }
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return apiJson(req, { ok: false, error: message }, { status });
  }
}
