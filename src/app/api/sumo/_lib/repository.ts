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

type UpdateBikeInput = {
  brand?: string;
  model?: string;
  year?: number | null;
  nickname?: string | null;
  displacement_cc?: number | null;
  plate?: string | null;
  photo_url?: string | null;
  notes?: string | null;
  is_public?: boolean;
};

type CreateSpotInput = {
  name: string;
  description?: string | null;
  city?: string | null;
  lat: number;
  lng: number;
  is_public?: boolean;
};

type CheckInPresenceInput = {
  routeId: string;
  userId: string;
  bikeId?: string | null;
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
    avatar_url?: string | null;
    default_share_live_location?: boolean;
  }
) {
  const supabase = supabaseAdminForProject("sumo");
  const payload: Record<string, unknown> = {};

  if (typeof input.username === "string") payload.username = input.username;
  if ("display_name" in input) payload.display_name = input.display_name ?? null;
  if ("home_city" in input) payload.home_city = input.home_city ?? null;
  if ("bio" in input) payload.bio = input.bio ?? null;
  if ("avatar_url" in input) payload.avatar_url = input.avatar_url ?? null;
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
    .select("*, bike_media(*)")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listPublicGarageByProfileId(profileId: string) {
  const supabase = supabaseAdminForProject("sumo");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }
  if (!profile) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  const { data, error } = await supabase
    .from("bikes")
    .select("*, bike_media(*)")
    .eq("owner_id", profileId)
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getGarageBike(userId: string, bikeId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("bikes")
    .select("*, bike_media(*)")
    .eq("id", bikeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("BIKE_NOT_FOUND");
  if (data.owner_id !== userId) throw new Error("FORBIDDEN");

  return data;
}

export async function updateGarageBike(userId: string, bikeId: string, input: UpdateBikeInput) {
  const supabase = supabaseAdminForProject("sumo");
  const { data: bike, error: bikeError } = await supabase
    .from("bikes")
    .select("id, owner_id")
    .eq("id", bikeId)
    .maybeSingle();

  if (bikeError) throw new Error(bikeError.message);
  if (!bike) throw new Error("BIKE_NOT_FOUND");
  if (bike.owner_id !== userId) throw new Error("FORBIDDEN");

  const payload: Record<string, unknown> = {};
  if (typeof input.brand === "string") payload.brand = input.brand;
  if (typeof input.model === "string") payload.model = input.model;
  if ("year" in input) payload.year = input.year ?? null;
  if ("nickname" in input) payload.nickname = input.nickname ?? null;
  if ("displacement_cc" in input) payload.displacement_cc = input.displacement_cc ?? null;
  if ("plate" in input) payload.plate = input.plate ?? null;
  if ("photo_url" in input) payload.photo_url = input.photo_url ?? null;
  if ("notes" in input) payload.notes = input.notes ?? null;
  if ("is_public" in input && typeof input.is_public === "boolean") payload.is_public = input.is_public;

  if (Object.keys(payload).length > 0) {
    const { error: updateError } = await supabase
      .from("bikes")
      .update(payload)
      .eq("id", bikeId)
      .eq("owner_id", userId);

    if (updateError) throw new Error(updateError.message);
  }

  return getGarageBike(userId, bikeId);
}

export async function listRouteMedia(routeId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("route_media")
    .select("*, profiles!route_media_uploaded_by_fkey(username,display_name,avatar_url)")
    .eq("route_id", routeId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRouteMedia(input: {
  routeId: string;
  uploadedBy: string;
  mediaUrl: string;
  caption?: string | null;
}) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("route_media")
    .insert({
      route_id: input.routeId,
      uploaded_by: input.uploadedBy,
      media_url: input.mediaUrl,
      caption: input.caption ?? null
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function listRoutePlans(routeId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("route_plans")
    .select("*, profiles!route_plans_user_id_fkey(username,display_name,avatar_url)")
    .eq("route_id", routeId)
    .gte("planned_at", new Date().toISOString())
    .order("planned_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRoutePlan(input: {
  routeId: string;
  userId: string;
  plannedAt: string;
  note?: string | null;
}) {
  const supabase = supabaseAdminForProject("sumo");
  const { data, error } = await supabase
    .from("route_plans")
    .insert({
      route_id: input.routeId,
      user_id: input.userId,
      planned_at: input.plannedAt,
      note: input.note ?? null,
      status: "planned"
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function listBikeMedia(bikeId: string, userId: string) {
  const supabase = supabaseAdminForProject("sumo");

  const { data: bike, error: bikeError } = await supabase
    .from("bikes")
    .select("id, owner_id")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeError) throw new Error(bikeError.message);
  if (!bike) throw new Error("BIKE_NOT_FOUND");
  if (bike.owner_id !== userId) throw new Error("FORBIDDEN");

  const { data, error } = await supabase.from("bike_media").select("*").eq("bike_id", bikeId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createBikeMedia(input: {
  bikeId: string;
  uploadedBy: string;
  mediaUrl: string;
  caption?: string | null;
}) {
  const supabase = supabaseAdminForProject("sumo");
  const { data: bike, error: bikeError } = await supabase
    .from("bikes")
    .select("id, owner_id")
    .eq("id", input.bikeId)
    .maybeSingle();
  if (bikeError) throw new Error(bikeError.message);
  if (!bike) throw new Error("BIKE_NOT_FOUND");
  if (bike.owner_id !== input.uploadedBy) throw new Error("FORBIDDEN");

  const { data, error } = await supabase
    .from("bike_media")
    .insert({
      bike_id: input.bikeId,
      uploaded_by: input.uploadedBy,
      media_url: input.mediaUrl,
      caption: input.caption ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
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

export async function getRoutePresence(routeId: string) {
  const supabase = supabaseAdminForProject("sumo");

  const { data, error } = await supabase
    .from("route_presence_live")
    .select(
      "route_id, user_id, username, display_name, avatar_url, bike_id, bike_brand, bike_model, bike_nickname, checked_in_at"
    )
    .eq("route_id", routeId)
    .order("checked_in_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const members = data ?? [];

  return {
    route_id: routeId,
    count: members.length,
    members
  };
}

export async function checkInRoutePresence(input: CheckInPresenceInput) {
  const supabase = supabaseAdminForProject("sumo");

  if (input.bikeId) {
    const { data: bike, error: bikeError } = await supabase
      .from("bikes")
      .select("id, owner_id")
      .eq("id", input.bikeId)
      .maybeSingle();

    if (bikeError) {
      throw new Error(bikeError.message);
    }
    if (!bike) {
      throw new Error("BIKE_NOT_FOUND");
    }
    if (bike.owner_id !== input.userId) {
      throw new Error("FORBIDDEN");
    }
  }

  const nowIso = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await supabase
    .from("route_presence")
    .update({
      bike_id: input.bikeId ?? null,
      last_seen_at: nowIso,
      checked_out_at: null
    })
    .eq("route_id", input.routeId)
    .eq("user_id", input.userId)
    .is("checked_out_at", null)
    .select("*");

  if (updateError) {
    throw new Error(updateError.message);
  }

  if ((updatedRows ?? []).length > 0) {
    return updatedRows?.[0];
  }

  const { data: inserted, error: insertError } = await supabase
    .from("route_presence")
    .insert({
      route_id: input.routeId,
      user_id: input.userId,
      bike_id: input.bikeId ?? null,
      checked_in_at: nowIso,
      last_seen_at: nowIso,
      checked_out_at: null
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return inserted;
}

export async function touchRoutePresence(routeId: string, userId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("route_presence")
    .update({
      last_seen_at: nowIso
    })
    .eq("route_id", routeId)
    .eq("user_id", userId)
    .is("checked_out_at", null);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true };
}

export async function checkOutRoutePresence(routeId: string, userId: string) {
  const supabase = supabaseAdminForProject("sumo");
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("route_presence")
    .update({
      checked_out_at: nowIso
    })
    .eq("route_id", routeId)
    .eq("user_id", userId)
    .is("checked_out_at", null);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true };
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


type PostMediaInput = {
  media_url: string;
  media_type?: "image" | "video";
  thumb_url?: string | null;
  sort_order?: number;
};

function normalizeMediaType(value: unknown): "image" | "video" {
  return value === "video" ? "video" : "image";
}

function buildFeedPostResponse(posts: any[]) {
  return posts.map((post) => ({
    ...post,
    post_media: [...(post.post_media ?? [])].sort(
      (a: { sort_order?: number }, b: { sort_order?: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    ),
    likes_count: 0,
    comments_count: 0,
    liked_by_me: false
  }));
}

async function attachPostMediaToPosts(supabase: ReturnType<typeof supabaseAdminForProject>, posts: any[]) {
  if (!posts.length) {
    return posts;
  }

  const postIds = posts.map((post: { id: string }) => post.id);
  const { data: mediaRows, error: mediaError } = await supabase
    .from("post_media")
    .select("id,post_id,media_type,media_url,thumb_url,sort_order,created_at")
    .in("post_id", postIds)
    .order("sort_order", { ascending: true });

  if (mediaError) throw new Error(mediaError.message);

  const mediaByPost = new Map<string, any[]>();
  for (const media of mediaRows ?? []) {
    const group = mediaByPost.get(media.post_id);
    if (group) {
      group.push(media);
    } else {
      mediaByPost.set(media.post_id, [media]);
    }
  }

  return posts.map((post) => ({
    ...post,
    post_media: mediaByPost.get(post.id) ?? []
  }));
}

export async function listFeedPosts(_viewerId: string | null, limit = 20, offset = 0) {
  const supabase = supabaseAdminForProject("sumo");
  const from = Math.max(0, offset);
  const to = Math.max(from, from + Math.max(1, Math.min(100, limit)) - 1);

  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      "id,author_id,body,route_id,visibility,created_at,updated_at,profiles!posts_author_id_fkey(id,username,display_name,avatar_url)"
    )
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  if (!posts || posts.length === 0) return [];

  const postsWithMedia = await attachPostMediaToPosts(supabase, posts as any[]);
  return buildFeedPostResponse(postsWithMedia);
}

export async function listRouteFeedPosts(routeId: string, limit = 20, offset = 0) {
  const supabase = supabaseAdminForProject("sumo");
  const from = Math.max(0, offset);
  const to = Math.max(from, from + Math.max(1, Math.min(100, limit)) - 1);

  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      "id,author_id,body,route_id,visibility,created_at,updated_at,profiles!posts_author_id_fkey(id,username,display_name,avatar_url)"
    )
    .eq("route_id", routeId)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  if (!posts || posts.length === 0) return [];

  const postsWithMedia = await attachPostMediaToPosts(supabase, posts as any[]);
  return buildFeedPostResponse(postsWithMedia);
}

export async function createFeedPost(
  userId: string,
  input: {
    body: string;
    route_id?: string | null;
    media?: PostMediaInput[];
  }
) {
  const supabase = supabaseAdminForProject("sumo");

  const cleanBody = input.body.trim();
  if (!cleanBody) {
    throw new Error("POST_BODY_REQUIRED");
  }

  const routeId = typeof input.route_id === "string" ? input.route_id.trim() : "";
  if (!routeId) {
    throw new Error("ROUTE_ID_REQUIRED");
  }

  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select("id")
    .eq("id", routeId)
    .maybeSingle();

  if (routeError) throw new Error(routeError.message);
  if (!route) throw new Error("ROUTE_NOT_FOUND");

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      author_id: userId,
      body: cleanBody,
      route_id: routeId,
      visibility: "public"
    })
    .select(
      "id,author_id,body,route_id,visibility,created_at,updated_at,profiles!posts_author_id_fkey(id,username,display_name,avatar_url)"
    )
    .single();

  if (postError) throw new Error(postError.message);

  const mediaRows = (input.media ?? [])
    .map((media, index) => ({
      post_id: post.id,
      media_type: normalizeMediaType(media.media_type),
      media_url: String(media.media_url ?? "").trim(),
      thumb_url: media.thumb_url ?? null,
      sort_order: Number.isFinite(media.sort_order) ? Number(media.sort_order) : index
    }))
    .filter((row) => row.media_url.length > 0);

  let insertedMedia: any[] = [];

  if (mediaRows.length > 0) {
    const { data, error: mediaError } = await supabase
      .from("post_media")
      .insert(mediaRows)
      .select("id,post_id,media_type,media_url,thumb_url,sort_order,created_at")
      .order("sort_order", { ascending: true });

    if (mediaError) throw new Error(mediaError.message);
    insertedMedia = data ?? [];
  }

  return {
    ...post,
    post_media: insertedMedia,
    likes_count: 0,
    comments_count: 0,
    liked_by_me: false
  };
}

export async function listProfileFeedPosts(profileId: string, _viewerId: string | null, limit = 20, offset = 0) {
  const supabase = supabaseAdminForProject("sumo");
  const from = Math.max(0, offset);
  const to = Math.max(from, from + Math.max(1, Math.min(100, limit)) - 1);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url,bio,home_city")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");

  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      "id,author_id,body,route_id,visibility,created_at,updated_at,profiles!posts_author_id_fkey(id,username,display_name,avatar_url)"
    )
    .eq("author_id", profileId)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  if (!posts || posts.length === 0) {
    return { profile, posts: [] };
  }

  const postsWithMedia = await attachPostMediaToPosts(supabase, posts as any[]);

  return {
    profile,
    posts: buildFeedPostResponse(postsWithMedia)
  };
}

export async function toggleFeedLike(postId: string, userId: string) {
  const supabase = supabaseAdminForProject("sumo");

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id,visibility")
    .eq("id", postId)
    .maybeSingle();

  if (postError) throw new Error(postError.message);
  if (!post) throw new Error("POST_NOT_FOUND");
  if (post.visibility !== "public") throw new Error("POST_NOT_VISIBLE");

  const { data: existing, error: existingError } = await supabase
    .from("post_likes")
    .select("post_id,user_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  let liked: boolean;

  if (existing) {
    const { error: deleteError } = await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
    if (deleteError) throw new Error(deleteError.message);
    liked = false;
  } else {
    const { error: insertError } = await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
    if (insertError) throw new Error(insertError.message);
    liked = true;
  }

  const { count, error: countError } = await supabase
    .from("post_likes")
    .select("post_id", { count: "exact", head: true })
    .eq("post_id", postId);

  if (countError) throw new Error(countError.message);

  return {
    liked,
    likes_count: count ?? 0
  };
}

export async function listFeedComments(postId: string, limit = 100) {
  const supabase = supabaseAdminForProject("sumo");

  const { data: comments, error } = await supabase
    .from("post_comments")
    .select(
      "id,post_id,user_id,parent_comment_id,body,created_at,updated_at,profiles!post_comments_user_id_fkey(id,username,display_name,avatar_url)"
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(300, limit)));

  if (error) throw new Error(error.message);
  return comments ?? [];
}

export async function createFeedComment(
  postId: string,
  userId: string,
  input: { body: string; parent_comment_id?: string | null }
) {
  const supabase = supabaseAdminForProject("sumo");

  const cleanBody = input.body.trim();
  if (!cleanBody) throw new Error("COMMENT_BODY_REQUIRED");

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id,visibility")
    .eq("id", postId)
    .maybeSingle();

  if (postError) throw new Error(postError.message);
  if (!post) throw new Error("POST_NOT_FOUND");
  if (post.visibility !== "public") throw new Error("POST_NOT_VISIBLE");

  const { data: comment, error } = await supabase
    .from("post_comments")
    .insert({
      post_id: postId,
      user_id: userId,
      parent_comment_id: input.parent_comment_id ?? null,
      body: cleanBody
    })
    .select("id,post_id,user_id,parent_comment_id,body,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);

  return {
    ...comment,
    profiles: profile ?? null
  };
}
export function normalizeErrorMessage(error: unknown) {
  return asErrorMessage(error);
}




