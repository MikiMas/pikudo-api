export type LatLngPoint = { lat: number; lng: number };

const OSRM_BASE_URL = "https://router.project-osrm.org";

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

export async function snapTraceToRoad(points: LatLngPoint[], stepsPerSegment = 30, epsilon = 0.00001): Promise<LatLngPoint[]> {
  const dense = densifyStraightSegments(points, stepsPerSegment);
  const snapped: LatLngPoint[] = [];

  for (const point of dense) {
    try {
      snapped.push(await snapPointToNearestRoad(point));
    } catch {
      // Si falla OSRM para un punto, mantenemos el punto original para preservar la traza.
      snapped.push(point);
    }
  }

  return dedupeNearPoints(snapped, epsilon);
}
