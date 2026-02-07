import { NextResponse } from "next/server";
import { isValidLatLngPoint, snapTraceToRoad } from "@/sumo/roads";

export const runtime = "nodejs";

type SnapBody = {
  points?: unknown;
  steps_per_segment?: unknown;
  dedupe_epsilon?: unknown;
};

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as SnapBody | null;
  if (!body || !Array.isArray(body.points)) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const points = body.points.filter(isValidLatLngPoint);
  if (points.length < 2) {
    return NextResponse.json({ ok: false, error: "MIN_2_POINTS_REQUIRED" }, { status: 400 });
  }

  if (points.length !== body.points.length) {
    return NextResponse.json({ ok: false, error: "INVALID_POINTS_FORMAT" }, { status: 400 });
  }

  const stepsPerSegment = Math.max(1, Math.min(100, Math.round(parseNumber(body.steps_per_segment, 30))));
  const dedupeEpsilon = Math.max(0.000001, Math.min(0.01, parseNumber(body.dedupe_epsilon, 0.00001)));

  try {
    const snapped = await snapTraceToRoad(points, stepsPerSegment, dedupeEpsilon);
    return NextResponse.json({
      ok: true,
      mode: "strict-user-order-nearest-snap",
      input_count: points.length,
      output_count: snapped.length,
      points: snapped
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SNAP_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
