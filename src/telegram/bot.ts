import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogItem } from "@/paypal/catalog";

function requireToken(): string {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN_MISSING");
  return token;
}

function getBaseUrl(): string {
  return `https://api.telegram.org/bot${requireToken()}`;
}

export function isValidTelegramSecret(req: Request): boolean {
  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (!expected) return true;
  const got = (req.headers.get("x-telegram-bot-api-secret-token") ?? "").trim();
  return Boolean(got && got === expected);
}

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<void> {
  const resp = await fetch(`${getBaseUrl()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`TELEGRAM_SEND_FAILED${errText ? `: ${errText}` : ""}`);
  }
}

export async function answerTelegramCallbackQuery(callbackQueryId: string): Promise<void> {
  const resp = await fetch(`${getBaseUrl()}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`TELEGRAM_SEND_FAILED${errText ? `: ${errText}` : ""}`);
  }
}

export async function sendTelegramOptions(
  chatId: number | string,
  text: string,
  options: { key: string; label: string }[]
): Promise<void> {
  const inline_keyboard = options.map((opt) => [{ text: opt.label, callback_data: `item:${opt.key}` }]);
  const resp = await fetch(`${getBaseUrl()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard }
    })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`TELEGRAM_SEND_FAILED${errText ? `: ${errText}` : ""}`);
  }
}

export async function sendTelegramDocument(chatId: number | string, item: CatalogItem): Promise<void> {
  const caption = item.telegram_caption || item.title || "Gracias por tu compra.";

  if (item.file_url) {
    const resp = await fetch(`${getBaseUrl()}/sendDocument`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        document: item.file_url,
        caption
      })
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`TELEGRAM_SEND_FAILED${errText ? `: ${errText}` : ""}`);
    }
    return;
  }

  if (item.file_path) {
    const abs = path.isAbsolute(item.file_path) ? item.file_path : path.join(process.cwd(), item.file_path);
    const buf = await readFile(abs);
    const filename = item.file_name || path.basename(abs) || "archivo";
    const mime = item.file_mime || "application/octet-stream";

    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", caption);
    form.append("document", new Blob([buf], { type: mime }), filename);

    const resp = await fetch(`${getBaseUrl()}/sendDocument`, {
      method: "POST",
      body: form
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`TELEGRAM_SEND_FAILED${errText ? `: ${errText}` : ""}`);
    }
    return;
  }

  throw new Error("CATALOG_ITEM_FILE_MISSING");
}
