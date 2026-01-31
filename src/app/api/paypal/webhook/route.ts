import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCatalogItem } from "@/paypal/catalog";
import {
  captureOrder,
  extractCaptureId,
  extractOrderId,
  getAcceptedEventTypes,
  verifyWebhookSignature,
  type PayPalWebhookEvent
} from "@/paypal/client";
import { sendTelegramDocument, sendTelegramMessage } from "@/telegram/bot";

export const runtime = "nodejs";

type PayPalOrderRow = {
  id: string;
  paypal_order_id: string;
  chat_id: number;
  item_key: string;
  status: string;
  capture_id: string | null;
};

function isCaptureCompleted(event: PayPalWebhookEvent): boolean {
  const status = String((event as any)?.resource?.status ?? "").toUpperCase();
  return !status || status === "COMPLETED";
}

async function markStatus(
  supabase: ReturnType<typeof supabaseAdmin>,
  orderId: string,
  values: Record<string, unknown>
) {
  await supabase.from("paypal_orders").update(values).eq("paypal_order_id", orderId);
}

export async function POST(req: Request) {
  let event: PayPalWebhookEvent | null = null;

  try {
    const raw = await req.text();
    event = JSON.parse(raw) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const eventType = typeof event?.event_type === "string" ? event.event_type : "";
  const acceptedTypes = getAcceptedEventTypes();
  if (!acceptedTypes.has(eventType)) {
    console.log("[paypal] ignored event", { eventType });
    return NextResponse.json({ ok: true, ignored: true, eventType }, { status: 200 });
  }

  const verified = await verifyWebhookSignature(event, req.headers);
  if (!verified) console.warn("[paypal] webhook not verified");
  if (!verified) return NextResponse.json({ ok: false, error: "WEBHOOK_NOT_VERIFIED" }, { status: 400 });

  if (eventType === "PAYMENT.CAPTURE.COMPLETED" && !isCaptureCompleted(event)) {
    return NextResponse.json({ ok: true, ignored: true, reason: "CAPTURE_NOT_COMPLETED" }, { status: 200 });
  }

  const orderId = extractOrderId(event);
  console.log("[paypal] event", { eventType, orderId });
  if (!orderId) return NextResponse.json({ ok: true, ignored: true, reason: "ORDER_NOT_FOUND" }, { status: 200 });

  const supabase = supabaseAdmin();
  const { data: order } = await supabase
    .from("paypal_orders")
    .select("id,paypal_order_id,chat_id,item_key,status,capture_id")
    .eq("paypal_order_id", orderId)
    .maybeSingle<PayPalOrderRow>();

  if (!order) return NextResponse.json({ ok: true, ignored: true, reason: "ORDER_NOT_FOUND" }, { status: 200 });
  console.log("[paypal] order loaded", { orderId, status: order.status, itemKey: order.item_key, chatId: order.chat_id });
  if (order.status === "fulfilled") return NextResponse.json({ ok: true, ignored: true, reason: "ALREADY_FULFILLED" }, { status: 200 });

  let captureId = order.capture_id ?? null;

  try {
    if (eventType === "CHECKOUT.ORDER.APPROVED") {
      console.log("[paypal] capture start", { orderId });
      const capture = await captureOrder(orderId);
      captureId = capture.captureId ?? captureId;
      const captureStatus = String(capture.status ?? "").toUpperCase();
      console.log("[paypal] capture", { orderId, captureId, captureStatus });
      if (captureStatus && captureStatus !== "COMPLETED") {
        await markStatus(supabase, orderId, {
          status: "capture_pending",
          capture_id: captureId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        return NextResponse.json({ ok: true, pending: true }, { status: 200 });
      }
      await markStatus(supabase, orderId, {
        status: "captured",
        capture_id: captureId,
        approved_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      captureId = captureId ?? extractCaptureId(event);
      console.log("[paypal] capture completed", { orderId, captureId });
      await markStatus(supabase, orderId, {
        status: "captured",
        capture_id: captureId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    const item = getCatalogItem(order.item_key);
    if (!item) {
      console.error("[paypal] catalog item missing", { itemKey: order.item_key });
      await markStatus(supabase, orderId, { status: "failed", updated_at: new Date().toISOString() });
      return NextResponse.json({ ok: false, error: "CATALOG_ITEM_NOT_FOUND" }, { status: 500 });
    }

    await sendTelegramDocument(order.chat_id, item);
    await sendTelegramMessage(order.chat_id, "Pago confirmado. Te he enviado el archivo. ¡Gracias!");
    console.log("[paypal] fulfilled", { orderId, chatId: order.chat_id });

    await markStatus(supabase, orderId, {
      status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    console.error("[paypal] error", message);
    await markStatus(supabase, orderId, {
      status: "failed",
      updated_at: new Date().toISOString()
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
