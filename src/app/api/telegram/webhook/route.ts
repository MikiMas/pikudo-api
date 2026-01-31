import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createOrder } from "@/paypal/client";
import { getCatalogItem, getDefaultItemKey, listCatalogKeys, requireCatalogItem } from "@/paypal/catalog";
import {
  answerTelegramCallbackQuery,
  isValidTelegramSecret,
  sendTelegramMessage,
  sendTelegramOptions
} from "@/telegram/bot";

export const runtime = "nodejs";

type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: { id?: number };
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: {
    id?: string;
    data?: string;
    message?: TelegramMessage;
  };
};

function formatCatalogList(): string {
  const keys = listCatalogKeys();
  if (keys.length === 0) return "No hay productos configurados.";
  return `Productos: ${keys.join(", ")}`;
}

function getCatalogOptions(): { key: string; label: string }[] {
  return listCatalogKeys().map((k) => ({ key: k, label: k }));
}

function envOrUndefined(key: string): string | undefined {
  const value = (process.env[key] ?? "").trim();
  return value || undefined;
}

function normalizeItemKey(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[0].toLowerCase() : null;
}

async function createPayAndReply(chatId: number, itemKey: string) {
  const safeItem = requireCatalogItem(itemKey);
  const order = await createOrder({
    amount: safeItem.amount,
    currency: safeItem.currency,
    description: safeItem.description || safeItem.title,
    customId: itemKey,
    invoiceId: `tg-${chatId}-${Date.now()}`,
    returnUrl: envOrUndefined("PAYPAL_RETURN_URL"),
    cancelUrl: envOrUndefined("PAYPAL_CANCEL_URL"),
    brandName: envOrUndefined("PAYPAL_BRAND_NAME") ?? "Pago"
  });

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("paypal_orders").insert({
    paypal_order_id: order.id,
    chat_id: chatId,
    item_key: itemKey,
    amount: safeItem.amount,
    currency: safeItem.currency,
    status: "created",
    approval_url: order.approveUrl,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (error) throw new Error(`DB_INSERT_FAILED: ${error.message}`);

  await sendTelegramMessage(chatId, `Aqui tienes tu enlace de pago: ${order.approveUrl}`);
}

export async function POST(req: Request) {
  if (!isValidTelegramSecret(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = (message?.text ?? "").trim();
  const callback = update?.callback_query;
  const callbackId = callback?.id;
  const callbackChatId = callback?.message?.chat?.id;
  const callbackData = (callback?.data ?? "").trim();

  if (callbackId) {
    try {
      await answerTelegramCallbackQuery(callbackId);
    } catch {
      // ignore callback answer errors
    }
  }

  if (callbackChatId && callbackData.startsWith("item:")) {
    const itemKey = callbackData.slice("item:".length).trim().toLowerCase();
    if (!getCatalogItem(itemKey)) {
      await sendTelegramMessage(callbackChatId, `Producto no valido. ${formatCatalogList()}`);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    try {
      await createPayAndReply(callbackChatId, itemKey);
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "ERROR";
      await sendTelegramMessage(callbackChatId, `Ahora mismo no puedo crear el pago: ${messageText}`);
      return NextResponse.json({ ok: false, error: messageText }, { status: 500 });
    }
  }

  if (!chatId) return NextResponse.json({ ok: true }, { status: 200 });

  if (!text || text === "/start") {
    const options = getCatalogOptions();
    if (options.length > 0) {
      await sendTelegramOptions(chatId, "Elige una opcion:", options);
    } else {
      await sendTelegramMessage(chatId, `Hola! Envia el nombre del producto. ${formatCatalogList()}`);
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const itemKey = normalizeItemKey(text) ?? getDefaultItemKey();
    if (!itemKey) {
      await sendTelegramMessage(chatId, `Indica el producto. Ejemplo: "algo". ${formatCatalogList()}`);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const item = getCatalogItem(itemKey);
    if (!item) {
      await sendTelegramMessage(chatId, `Producto no valido. ${formatCatalogList()}`);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    await createPayAndReply(chatId, itemKey);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "ERROR";
    await sendTelegramMessage(chatId, `Ahora mismo no puedo crear el pago: ${messageText}`);
    return NextResponse.json({ ok: false, error: messageText }, { status: 500 });
  }
}
