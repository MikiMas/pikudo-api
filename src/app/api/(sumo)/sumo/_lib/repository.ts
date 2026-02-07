import { supabaseAdminForProject } from "@/lib/supabaseAdmin";

export type LatLng = { lat: number; lng: number };

export type RouteDifficulty = "easy" | "medium" | "hard";

type CreateRouteInput = {
  title: string;
  description?: string | null;
  city?: string | null;
  difficulty?: RouteDifficulty;
  distance_km?: number | null;
  estimated_minutes?: number | null;
  start_lat: number;
  start_lng: number;
  is_public?: boolean;
};

type CreateBikeInput = {
  brand: string;
  model: string;
  year?: number | null;
  nickname?: string | null;
  displacement_cc?: number | null;
  plate?: string | null;
  photo_url?: string | null;
  notes?: string | null;
  is_public?: boolean;
};

type CreateBikeModInput = {
  bike_id: string;
  name: string;
  category?: string;
  notes?: string | null;
};

type CreateSpotInput = {
  name: string;
  description?: string | null;
  city?: string | null;
  lat: number;
  lng: number;
  is_public?: boolean;
};

function asErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return message;
    }
  }
  return "UNKNOWN_ERROR";
}

function ensureFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return value;
}

function ensureDifficulty(value: unknown): RouteDifficulty {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }
  return "medium";
}

export async function getProfileById(userId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function upsertProfileById(
  userId: string,
  input: {
    username?: string;
    display_name?: string | null;
    home_city?: string | null;
    bio?: string | null;
    default_share_live_location?: boolean;
  }
) {
  const supabase = supabaseAdminForProject("sumo");
  const payload: Record<string, unknown> = {};

  if (typeof input.username === "string") payload.username = input.username;
  if ("display_name" in input) payload.display_name = input.display_name ?? null;
  if ("home_city" in input) payload.home_city = input.home_city ?? null;
  if ("bio" in input) payload.bio = input.bio ?? null;
  if (typeof input.default_share_live_location === "boolean") {
    payload.default_share_live_location = input.default_share_live_location;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getHomeStats(userId: string) {
  const supabase = supabaseAdminForProject("sumo");

  const [bikesRes, routesRes, sessionsRes] = await Promise.all([
    supabase.from("bikes").select("id", { count: "exact", head: true }).eq("owner_id", userId),
    supabase.from("routes").select("id", { count: "exact", head: true }).eq("is_public", true),
    supabase.from("route_sessions").select("id", { count: "exact", head: true }).eq("status", "active")
  ]);

  if (bikesRes.error) throw new Error(bikesRes.error.message);
  if (routesRes.error) throw new Error(routesRes.error.message);
  if (sessionsRes.error) throw new Error(sessionsRes.error.message);

  return {
    myBikes: bikesRes.count ?? 0,
    publicRoutes: routesRes.count ?? 0,
    activeSessions: sessionsRes.count ?? 0
  };
}

export async function listGarage(userId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("bikes")
    .select("*, bike_mods(*)")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createBike(userId: string, input: CreateBikeInput) {
  const supabase = supabaseAdminForProject("sumo");

  const payload = {
    owner_id: userId,
    brand: input.brand,
    model: input.model,
    year: input.year ?? null,
    nickname: input.nickname ?? null,
    displacement_cc: input.displacement_cc ?? null,
    plate: input.plate ?? null,
    photo_url: input.photo_url ?? null,
    notes: input.notes ?? null,
    is_public: input.is_public ?? true
  };

  const { data, error } = await supabase.from("bikes").insert(payload).select("*").single();
  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createBikeMod(userId: string, input: CreateBikeModInput) {
  const supabase = supabaseAdminForProject("sumo");

  const { data: bike, error: bikeError } = await supabase
    .from("bikes")
    .select("id, owner_id")
    .eq("id", input.bike_id)
    .maybeSingle();

  if (bikeError) throw new Error(bikeError.message);
  if (!bike) throw new Error("BIKE_NOT_FOUND");
  if (bike.owner_id !== userId) throw new Error("FORBIDDEN");

  const { data, error } = await supabase
    .from("bike_mods")
    .insert({
      bike_id: input.bike_id,
      name: input.name,
      category: input.category ?? "general",
      notes: input.notes ?? null
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function listRoutes() {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("routes")
    .select("*, profiles!routes_created_by_fkey(username)")
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getRoute(routeId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("routes")
    .select("*, profiles!routes_created_by_fkey(username)")
    .eq("id", routeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createRoute(userId: string, input: CreateRouteInput) {
  const supabase = supabaseAdminForProject("sumo");

  const payload = {
    created_by: userId,
    title: input.title,
    description: input.description ?? null,
    city: input.city ?? null,
    difficulty: ensureDifficulty(input.difficulty),
    distance_km: input.distance_km ?? null,
    estimated_minutes: input.estimated_minutes ?? null,
    start_lat: ensureFiniteNumber(input.start_lat, "start_lat"),
    start_lng: ensureFiniteNumber(input.start_lng, "start_lng"),
    is_public: input.is_public ?? true
  };

  const { data, error } = await supabase.from("routes").insert(payload).select("*").single();
  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function listRoutePoints(routeId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("route_points")
    .select("id, route_id, point_order, lat, lng")
    .eq("route_id", routeId)
    .order("point_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function replaceRoutePoints(routeId: string, userId: string, points: LatLng[]) {
  const supabase = supabaseAdminForProject("sumo");

  const route = await getRoute(routeId);
  if (!route) {
    throw new Error("ROUTE_NOT_FOUND");
  }

  if (route.created_by !== userId) {
    throw new Error("FORBIDDEN");
  }

  const { error: deleteError } = await supabase.from("route_points").delete().eq("route_id", routeId);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (points.length === 0) {
    return [];
  }

  const rows = points.map((point, index) => ({
    route_id: routeId,
    point_order: index,
    lat: ensureFiniteNumber(point.lat, "lat"),
    lng: ensureFiniteNumber(point.lng, "lng")
  }));

  const { error: insertError } = await supabase.from("route_points").insert(rows);
  if (insertError) {
    throw new Error(insertError.message);
  }

  return rows;
}

export async function listActiveRiders(routeId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("route_sessions")
    .select("id, user_id, last_lat, last_lng, last_seen_at, is_location_shared, status, profiles!route_sessions_user_id_fkey(username)")
    .eq("route_id", routeId)
    .eq("status", "active")
    .eq("is_location_shared", true)
    .order("last_seen_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getMyActiveSession(routeId: string, userId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("route_sessions")
    .select("*")
    .eq("route_id", routeId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function startRouteSession(routeId: string, userId: string, isLocationShared: boolean) {
  const supabase = supabaseAdminForProject("sumo");

  const existing = await getMyActiveSession(routeId, userId);
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("route_sessions")
    .insert({
      route_id: routeId,
      user_id: userId,
      status: "active",
      is_location_shared: isLocationShared
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function stopRouteSession(sessionId: string, userId: string) {
  const supabase = supabaseAdminForProject("sumo");

  const { data: session, error: sessionError } = await supabase
    .from("route_sessions")
    .select("id,user_id,status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.user_id !== userId) throw new Error("FORBIDDEN");

  const { error } = await supabase
    .from("route_sessions")
    .update({
      status: "completed",
      ended_at: new Date().toISOString()
    })
    .eq("id", sessionId);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true };
}

export async function sendLocationTick(input: {
  routeId: string;
  sessionId: string;
  userId: string;
  lat: number;
  lng: number;
  speedMps?: number | null;
  headingDeg?: number | null;
  accuracyM?: number | null;
}) {
  const supabase = supabaseAdminForProject("sumo");

  const { data: session, error: sessionError } = await supabase
    .from("route_sessions")
    .select("id,user_id,route_id,status")
    .eq("id", input.sessionId)
    .maybeSingle();

  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.user_id !== input.userId) throw new Error("FORBIDDEN");
  if (session.route_id !== input.routeId) throw new Error("SESSION_ROUTE_MISMATCH");
  if (session.status !== "active") throw new Error("SESSION_NOT_ACTIVE");

  const nowIso = new Date().toISOString();

  const { error: insertError } = await supabase.from("session_locations").insert({
    session_id: input.sessionId,
    route_id: input.routeId,
    user_id: input.userId,
    lat: ensureFiniteNumber(input.lat, "lat"),
    lng: ensureFiniteNumber(input.lng, "lng"),
    speed_mps: input.speedMps ?? null,
    heading_deg: input.headingDeg ?? null,
    accuracy_m: input.accuracyM ?? null,
    captured_at: nowIso
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: updateError } = await supabase
    .from("route_sessions")
    .update({
      last_lat: input.lat,
      last_lng: input.lng,
      last_speed_mps: input.speedMps ?? null,
      last_heading_deg: input.headingDeg ?? null,
      last_seen_at: nowIso
    })
    .eq("id", input.sessionId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return { ok: true };
}

export async function isNearRouteStart(routeId: string, lat: number, lng: number, radiusM = 500) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase.rpc("is_point_near_route_start", {
    p_route_id: routeId,
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM
  });

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function listSpots() {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("spots")
    .select("*, profiles!spots_created_by_fkey(username)")
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createSpot(userId: string, input: CreateSpotInput) {
  const supabase = supabaseAdminForProject("sumo");

  const payload = {
    created_by: userId,
    name: input.name,
    description: input.description ?? null,
    city: input.city ?? null,
    lat: ensureFiniteNumber(input.lat, "lat"),
    lng: ensureFiniteNumber(input.lng, "lng"),
    is_public: input.is_public ?? true
  };

  const { data, error } = await supabase.from("spots").insert(payload).select("*").single();
  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export function normalizeErrorMessage(error: unknown) {
  return asErrorMessage(error);
}

