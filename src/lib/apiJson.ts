import { NextResponse } from "next/server";

type JsonInit = ResponseInit | undefined;

export function apiJson(req: Request, body: unknown, init?: JsonInit) {
  const status = init?.status ?? 200;
  console.log("[API]", { url: req.url, status });
  return NextResponse.json(body, init);
}
