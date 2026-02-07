import { readFile } from "node:fs/promises";
import path from "node:path";

export type CatalogItem = {
  amount: string;
  currency: string;
  title?: string;
  description?: string;
  file_url?: string;
  file_path?: string;
  file_name?: string;
  file_mime?: string;
  telegram_caption?: string;
};

export type CatalogMap = Record<string, CatalogItem>;

function parseJson(): CatalogMap {
  const raw = (process.env.PAYPAL_CATALOG_JSON ?? "").trim();
  if (!raw) throw new Error("PAYPAL_CATALOG_JSON_MISSING");
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object") throw new Error("PAYPAL_CATALOG_JSON_INVALID");
  return data as CatalogMap;
}

let catalogCache: CatalogMap | null = null;

export function getCatalog(): CatalogMap {
  if (catalogCache) return catalogCache;
  catalogCache = parseJson();
  return catalogCache;
}

export function listCatalogKeys(): string[] {
  return Object.keys(getCatalog()).sort();
}

export function getDefaultItemKey(): string | null {
  const key = (process.env.PAYPAL_DEFAULT_ITEM ?? "").trim();
  return key || null;
}

export function getCatalogItem(key: string): CatalogItem | null {
  if (!key) return null;
  const item = getCatalog()[key];
  return item ?? null;
}

export function requireCatalogItem(key: string): CatalogItem {
  const item = getCatalogItem(key);
  if (!item) throw new Error("CATALOG_ITEM_NOT_FOUND");
  if (!item.amount || !item.currency) throw new Error("CATALOG_ITEM_INVALID");
  return item;
}

export async function loadItemFile(item: CatalogItem): Promise<{ filename: string; mime: string; bytes: Uint8Array }> {
  if (item.file_url) {
    const resp = await fetch(item.file_url);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`FILE_FETCH_FAILED${errText ? `: ${errText}` : ""}`);
    }
    const buf = new Uint8Array(await resp.arrayBuffer());
    const mime = (item.file_mime || resp.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const filename = item.file_name || path.basename(new URL(item.file_url).pathname) || "archivo";
    return { filename, mime, bytes: buf };
  }

  if (item.file_path) {
    const abs = path.isAbsolute(item.file_path) ? item.file_path : path.join(process.cwd(), item.file_path);
    const buf = await readFile(abs);
    const filename = item.file_name || path.basename(abs) || "archivo";
    const mime = item.file_mime || "application/octet-stream";
    return { filename, mime, bytes: new Uint8Array(buf) };
  }

  throw new Error("CATALOG_ITEM_FILE_MISSING");
}
