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
  console.log("[API]", toApiPath(req.url), status);
  return NextResponse.json(body, init);
}