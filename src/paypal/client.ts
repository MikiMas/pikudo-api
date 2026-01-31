const tokenCache = { value: "", expiresAt: 0 };

export type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: unknown;
};

export type CreateOrderInput = {
  amount: string;
  currency: string;
  description?: string;
  customId?: string;
  invoiceId?: string;
  returnUrl?: string;
  cancelUrl?: string;
  brandName?: string;
};

export type CreateOrderResult = {
  id: string;
  approveUrl: string;
};

export type CaptureOrderResult = {
  status: string;
  captureId?: string;
  raw?: unknown;
};

function getPayPalEnv(): "live" | "sandbox" {
  const env = (process.env.PAYPAL_ENV ?? "sandbox").toLowerCase();
  return env === "live" ? "live" : "sandbox";
}

export function getPayPalBaseUrl(): string {
  return getPayPalEnv() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function getPayPalApproveFallback(orderId: string): string {
  const host = getPayPalEnv() === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
  return `${host}/checkoutnow?token=${orderId}`;
}

export function shouldVerifyWebhook(): boolean {
  const raw = (process.env.PAYPAL_WEBHOOK_VERIFY ?? "true").toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "no");
}

export function getAcceptedEventTypes(): Set<string> {
  const raw = process.env.PAYPAL_ACCEPTED_EVENT_TYPES ?? "CHECKOUT.ORDER.APPROVED,PAYMENT.CAPTURE.COMPLETED";
  const types = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return new Set(types);
}

async function fetchAccessToken(): Promise<{ token: string; expiresIn: number }> {
  const clientId = process.env.PAYPAL_CLIENT_ID ?? "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) throw new Error("PAYPAL_CREDENTIALS_MISSING");

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`PAYPAL_TOKEN_FAILED${errText ? `: ${errText}` : ""}`);
  }

  const data = (await resp.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!data?.access_token) throw new Error("PAYPAL_TOKEN_FAILED");
  return { token: data.access_token, expiresIn: Math.max(0, Number(data.expires_in ?? 0)) };
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.expiresAt - 60_000) return tokenCache.value;

  const { token, expiresIn } = await fetchAccessToken();
  tokenCache.value = token;
  tokenCache.expiresAt = now + Math.max(60, expiresIn) * 1000;
  return token;
}

export async function verifyWebhookSignature(event: PayPalWebhookEvent, headers: Headers): Promise<boolean> {
  if (!shouldVerifyWebhook()) return true;

  const webhookId = (process.env.PAYPAL_WEBHOOK_ID ?? "").trim();
  if (!webhookId) return false;

  const authAlgo = headers.get("paypal-auth-algo") ?? "";
  const certUrl = headers.get("paypal-cert-url") ?? "";
  const transmissionId = headers.get("paypal-transmission-id") ?? "";
  const transmissionSig = headers.get("paypal-transmission-sig") ?? "";
  const transmissionTime = headers.get("paypal-transmission-time") ?? "";

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) return false;

  const token = await getAccessToken();
  const resp = await fetch(`${getPayPalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: event
    })
  });

  if (!resp.ok) return false;
  const data = (await resp.json().catch(() => null)) as { verification_status?: string } | null;
  return data?.verification_status === "SUCCESS";
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const token = await getAccessToken();
  const body: any = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: input.currency,
          value: input.amount
        },
        description: input.description,
        custom_id: input.customId,
        invoice_id: input.invoiceId
      }
    ],
    application_context: {
      brand_name: input.brandName,
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING"
    }
  };

  if (input.returnUrl) body.application_context.return_url = input.returnUrl;
  if (input.cancelUrl) body.application_context.cancel_url = input.cancelUrl;

  const resp = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`PAYPAL_ORDER_FAILED${errText ? `: ${errText}` : ""}`);
  }

  const data = (await resp.json().catch(() => null)) as { id?: string; links?: { rel?: string; href?: string }[] } | null;
  const id = data?.id ?? "";
  if (!id) throw new Error("PAYPAL_ORDER_FAILED");

  const approveUrl = data?.links?.find((l) => l?.rel === "approve")?.href ?? getPayPalApproveFallback(id);
  return { id, approveUrl };
}

export async function captureOrder(orderId: string): Promise<CaptureOrderResult> {
  if (!orderId) throw new Error("PAYPAL_CAPTURE_MISSING_ORDER");
  const token = await getAccessToken();
  const resp = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`PAYPAL_CAPTURE_FAILED${errText ? `: ${errText}` : ""}`);
  }

  const data = (await resp.json().catch(() => null)) as any;
  const captureId = data?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  const status = String(data?.status ?? "");
  return { status, captureId, raw: data };
}

export function extractOrderId(event: PayPalWebhookEvent): string | null {
  const resource = event?.resource as any;
  if (!resource) return null;
  const eventType = String(event?.event_type ?? "");

  if (eventType.startsWith("CHECKOUT.ORDER.") && typeof resource?.id === "string") return resource.id;

  const related = resource?.supplementary_data?.related_ids?.order_id;
  if (typeof related === "string" && related) return related;

  if (typeof resource?.order_id === "string") return resource.order_id;
  return null;
}

export function extractCaptureId(event: PayPalWebhookEvent): string | null {
  const resource = event?.resource as any;
  if (typeof resource?.id === "string") return resource.id;
  return null;
}
