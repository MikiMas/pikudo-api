import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramMessage } from "@/telegram/bot";

export const runtime = "nodejs";

type PayPalOrderRow = {
  chat_id: number;
  paypal_order_id: string;
};

function getBotLink(): string {
  const username = (process.env.TELEGRAM_BOT_USERNAME ?? "").trim();
  if (!username) return "https://t.me";
  return `https://t.me/${username}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? url.searchParams.get("order_id") ?? "").trim();

  if (token) {
    const supabase = supabaseAdmin();
    const { data: order } = await supabase
      .from("paypal_orders")
      .select("chat_id,paypal_order_id")
      .eq("paypal_order_id", token)
      .maybeSingle<PayPalOrderRow>();

    if (order?.chat_id) {
      await sendTelegramMessage(
        order.chat_id,
        "Pago aprobado. Si todo va bien, en unos segundos recibirás el archivo aquí."
      );
      await supabase
        .from("paypal_orders")
        .update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("paypal_order_id", token);
    }
  }

  return NextResponse.redirect(`${getBotLink()}?start=paid`, 302);
}
