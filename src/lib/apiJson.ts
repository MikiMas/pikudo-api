import { NextResponse } from "next/server";

type JsonInit = ResponseInit | undefined;

function toApiPath(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return rawUrl;
  }
}

export function apiJson(req: Request, body: unknown, init?: JsonInit) {
  const status = init?.status ?? 200;
  const path = toApiPath(req.url);
  console.log("[API]", path, status);

  if (status >= 500) {
    const errorMessage =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error?: unknown }).error ?? "INTERNAL_SERVER_ERROR")
        : "INTERNAL_SERVER_ERROR";
    console.error("[API_ERROR]", path, status, errorMessage);
  }

  return NextResponse.json(body, init);
}