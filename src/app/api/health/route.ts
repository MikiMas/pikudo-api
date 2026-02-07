import { NextResponse } from "next/server";`r`nimport { apiJson } from "@/lib/apiJson";
import { getBlockStartUTC, secondsToNextBlock } from "@/lib/timeBlock";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const now = new Date();
  const blockStart = getBlockStartUTC(now);
  const seconds = secondsToNextBlock(now);

  return apiJson(req, {
    ok: true,
    now_utc: now.toISOString(),
    block_start_utc: blockStart.toISOString(),
    seconds_to_next_block: seconds
  });
}


