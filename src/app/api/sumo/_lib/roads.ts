export type LatLngPoint = { lat: number; lng: number };

const OSRM_BASE_URL = "https://router.project-osrm.org";
const MAPBOX_BASE_URL = "https://api.mapbox.com";
const MAPBOX_MAX_COORDS = 100;

function assertFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidLatLngPoint(point: unknown): point is LatLngPoint {
  if (!point || typeof point !== "object") return false;
  const obj = point as Record<string, unknown>;
  if (!assertFiniteNumber(obj.lat) || !assertFiniteNumber(obj.lng)) return false;
  return obj.lat >= -90 && obj.lat <= 90 && obj.lng >= -180 && obj.lng <= 180;
}

export function densifyStraightSegments(points: LatLngPoint[], stepsPerSegment = 30): LatLngPoint[] {
  if (points.length < 2) return points;

  const dense: LatLngPoint[] = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];

    for (let step = 1; step <= stepsPerSegment; step += 1) {
      const t = step / stepsPerSegment;
      dense.push({
        lat: from.lat + (to.lat - from.lat) * t,
        lng: from.lng + (to.lng - from.lng) * t
      });
    }
  }

  return dense;
}

export function dedupeNearPoints(points: LatLngPoint[], epsilon = 0.00001): LatLngPoint[] {
  if (points.length === 0) return points;

  const result: LatLngPoint[] = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const prev = result[result.length - 1];
    const curr = points[index];
    const latDiff = Math.abs(curr.lat - prev.lat);
    const lngDiff = Math.abs(curr.lng - prev.lng);
    if (latDiff > epsilon || lngDiff > epsilon) {
      result.push(curr);
    }
  }

  return result;
}

export async function snapPointToNearestRoad(point: LatLngPoint): Promise<LatLngPoint> {
  const url = `${OSRM_BASE_URL}/nearest/v1/driving/${point.lng},${point.lat}?number=1`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`OSRM_NEAREST_HTTP_${response.status}`);
  }

  const json = (await response.json()) as {
    waypoints?: { location?: number[] }[];
  };

  const location = json.waypoints?.[0]?.location;
  if (!location || location.length < 2) {
    throw new Error("OSRM_NEAREST_NO_LOCATION");
  }

  return { lng: location[0], lat: location[1] };
}

function toCoordsParam(points: LatLngPoint[]): string {
  return points.map((point) => `${point.lng},${point.lat}`).join(";");
}

function chunkPoints(points: LatLngPoint[], chunkSize: number): LatLngPoint[][] {
  const chunks: LatLngPoint[][] = [];
  for (let index = 0; index < points.length; index += chunkSize) {
    chunks.push(points.slice(index, index + chunkSize));
  }
  return chunks;
}

async function mapboxMatch(points: LatLngPoint[]): Promise<LatLngPoint[]> {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("MAPBOX_ACCESS_TOKEN_MISSING");
  }

  const chunks = chunkPoints(points, MAPBOX_MAX_COORDS);
  const snapped: LatLngPoint[] = [];

  for (const segment of chunks) {
    if (segment.length < 2) {
      snapped.push(...segment);
      continue;
    }

    const coords = toCoordsParam(segment);
    const url = `${MAPBOX_BASE_URL}/matching/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&tidy=true&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`MAPBOX_MATCH_HTTP_${response.status}`);
    }

    const json = (await response.json()) as {
      code?: string;
      message?: string;
      matchings?: { geometry?: { coordinates?: number[][] } }[];
    };

    if (json.code !== "Ok") {
      throw new Error(`MAPBOX_MATCH_${json.code ?? "FAILED"}${json.message ? `: ${json.message}` : ""}`);
    }

    const geometry = json.matchings?.[0]?.geometry?.coordinates;
    if (!geometry || geometry.length < 2) {
      throw new Error("MAPBOX_MATCH_NO_GEOMETRY");
    }

    const pointsChunk = geometry
      .filter((pair) => Array.isArray(pair) && pair.length >= 2 && assertFiniteNumber(pair[0]) && assertFiniteNumber(pair[1]))
      .map((pair) => ({ lng: pair[0], lat: pair[1] }));

    if (pointsChunk.length < 2) {
      throw new Error("MAPBOX_MATCH_INVALID_GEOMETRY");
    }

    if (snapped.length > 0) {
      pointsChunk.shift();
    }
    snapped.push(...pointsChunk);
  }

  if (snapped.length < 2) {
    throw new Error("MAPBOX_MATCH_OUTPUT_TOO_SHORT");
  }

  return snapped;
}

export async function snapTraceToRoad(points: LatLngPoint[], stepsPerSegment = 30, epsilon = 0.00001): Promise<LatLngPoint[]> {
  const dense = densifyStraightSegments(points, stepsPerSegment);

  try {
    const matched = await mapboxMatch(dense);
    return dedupeNearPoints(matched, epsilon);
  } catch {
    const snapped: LatLngPoint[] = [];

    for (const point of dense) {
      try {
        snapped.push(await snapPointToNearestRoad(point));
      } catch {
        snapped.push(point);
      }
    }

    return dedupeNearPoints(snapped, epsilon);
  }
}