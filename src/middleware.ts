import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function isAllowedOrigin(req: NextRequest, origin: string): boolean {
  try {
    const o = new URL(origin);
    if (o.host === req.nextUrl.host) return true;
    if (o.host === "localhost:3000") return true;
    return false;
  } catch {
    return false;
  }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function logApiRequest(req: NextRequest): void {
  const requestId = crypto.randomUUID().slice(0, 8);
  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") || "unknown";

  console.log("[API] [IN]", {
    requestId,
    method: req.method,
    path: req.nextUrl.pathname,
    query: req.nextUrl.search,
    ip,
    ua
  });
}

function withApiHeaders(res: NextResponse, req: NextRequest): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.headers.set("Cache-Control", "no-store");

  const origin = req.headers.get("origin");
  if (origin && isAllowedOrigin(req, origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "content-type,x-device-id");
  }

  return res;
}

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  logApiRequest(req);

  // Avoid cloning large multipart bodies for upload endpoint.
  if (req.nextUrl.pathname === "/api/upload") return NextResponse.next();

  if (req.method === "OPTIONS") {
    return withApiHeaders(new NextResponse(null, { status: 204 }), req);
  }

  return withApiHeaders(NextResponse.next(), req);
}

export const config = {
  matcher: ["/api/:path*"]
};
