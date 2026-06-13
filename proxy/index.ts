import { transit_realtime } from "gtfs-realtime-bindings";
import { Database } from "bun:sqlite";
import * as path from "path";

const FEED_BASE = "https://api.data.gov.my/gtfs-realtime";
const POLL_INTERVAL_MS = 30_000;
const PORT = parseInt(process.env.PORT ?? "3001");
const DB_PATH =
  process.env.GTFS_DB_PATH ??
  path.join(import.meta.dir, "../scripts/data/gtfs.db");

// ── Vehicle positions (live) ──────────────────────────────────────────────────

type VehiclePosition = {
  vehicleId: string;
  label: string;
  lat: number;
  lng: number;
  routeId: string;
  tripId: string;
  timestamp: number;
};

type FeedState = {
  vehicles: VehiclePosition[];
  fetchedAt: number;
};

let state: FeedState = { vehicles: [], fetchedAt: 0 };
const sseClients = new Set<ReadableStreamDefaultController>();

const CATEGORIES = ["rapid-bus-mrtfeeder", "rapid-bus-kl"];

async function fetchVehicles() {
  const results: VehiclePosition[] = [];

  for (const category of CATEGORIES) {
    try {
      const res = await fetch(
        `${FEED_BASE}/vehicle-position/prasarana/?category=${category}`
      );
      if (!res.ok) {
        console.error(`Feed ${category}: HTTP ${res.status}`);
        continue;
      }
      const buf = await res.arrayBuffer();
      const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buf));
      for (const entity of feed.entity) {
        const v = entity.vehicle;
        if (!v?.position || !v.vehicle) continue;
        results.push({
          vehicleId: `${category}:${entity.id}`,
          label: v.vehicle.label ?? v.vehicle.id ?? entity.id,
          lat: v.position.latitude,
          lng: v.position.longitude,
          routeId: v.trip?.routeId ?? "",
          tripId: v.trip?.tripId ?? "",
          timestamp: v.timestamp
            ? Number(v.timestamp)
            : Math.floor(Date.now() / 1000),
        });
      }
    } catch (e) {
      console.error(`Feed ${category} error:`, e);
    }
  }

  state = { vehicles: results, fetchedAt: Date.now() };
  console.log(
    `[${new Date().toISOString()}] Vehicles: ${results.length} across ${CATEGORIES.length} categories`
  );
  broadcastUpdate();
}

function broadcastUpdate() {
  const payload = `data: ${JSON.stringify({
    type: "update",
    fetchedAt: state.fetchedAt,
    vehicleCount: state.vehicles.length,
  })}\n\n`;
  for (const ctrl of sseClients) {
    try {
      ctrl.enqueue(payload);
    } catch {
      sseClients.delete(ctrl);
    }
  }
}

// SSE heartbeat: a comment line keeps the connection alive between the 30s
// vehicle polls so idle-timeout proxies/clients don't drop the stream
// (otherwise the client thrashes through ERR_INCOMPLETE_CHUNKED_ENCODING +
// reconnect loops and the "Live" freshness badge never settles).
setInterval(() => {
  for (const ctrl of sseClients) {
    try {
      ctrl.enqueue(`: ping\n\n`);
    } catch {
      sseClients.delete(ctrl);
    }
  }
}, 15_000);

// ── SQLite arrivals (from GTFS static) ───────────────────────────────────────

let db: Database | null = null;

function openDb() {
  try {
    db = new Database(DB_PATH, { readonly: true });
    const n = db.query<{ n: number }, []>("SELECT count(*) as n FROM stops").get()!.n;
    console.log(`GTFS DB loaded: ${n} stops at ${DB_PATH}`);
  } catch (e) {
    console.error(`GTFS DB unavailable (${DB_PATH}):`, e);
    db = null;
  }
}

type ArrivalRow = {
  arrival_time: string;
  departure_time: string;
  route_id: string;
  route_name: string;
  category: string;
  trip_headsign: string;
  trip_id: string;
};

// Day-of-week column names matching calendar.txt
const DOW_COLUMNS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function getUpcomingArrivals(stopId: string, limit = 6): ArrivalRow[] {
  if (!db) return [];

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const currentTime = `${hh}:${mm}:${ss}`;
  const todayCol = DOW_COLUMNS[now.getDay()];
  const todayDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  // Also handle GTFS "past-midnight" times (e.g. 25:30:00 for 1:30am next day)
  // For simplicity in MVP, only query times >= now and < 24:00:00
  return db
    .query<ArrivalRow, [string, string, string, string]>(
      `SELECT
        st.arrival_time,
        st.departure_time,
        r.route_id,
        COALESCE(NULLIF(r.route_short_name,''), NULLIF(r.route_long_name,''), r.route_id) AS route_name,
        r.category,
        t.trip_headsign,
        t.trip_id
      FROM stop_times st
      JOIN trips t ON st.trip_id = t.trip_id
      JOIN routes r ON t.route_id = r.route_id
      JOIN calendar c ON t.service_id = c.service_id
      WHERE st.stop_id = ?
        AND st.arrival_time >= ?
        AND st.arrival_time < '24:00:00'
        AND c.${todayCol} = 1
        AND c.start_date <= ?
        AND c.end_date >= ?
      ORDER BY st.arrival_time
      LIMIT ?`
    )
    .all(stopId, currentTime, todayDate, todayDate, limit);
}

type StopRow = {
  stop_id: string;
  stop_code: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
};

// Service type derived from GTFS category — drives the route badge colour
// (feeder = green, trunk = blue) per the Moovit teardown / Godeez brand.
function serviceType(category: string): "feeder" | "trunk" {
  return category === "rapid-bus-mrtfeeder" ? "feeder" : "trunk";
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type RouteBadge = { route_name: string; service_type: "feeder" | "trunk" };

// Distinct routes serving a stop — shown on the nearby-stops walk-time list.
function getStopRoutes(stopId: string, limit = 8): RouteBadge[] {
  if (!db) return [];
  const rows = db
    .query<{ route_name: string; category: string }, [string, number]>(
      `SELECT DISTINCT
        COALESCE(NULLIF(r.route_short_name,''), NULLIF(r.route_long_name,''), r.route_id) AS route_name,
        r.category
       FROM stop_times st
       JOIN trips t ON t.trip_id = st.trip_id
       JOIN routes r ON r.route_id = t.route_id
       WHERE st.stop_id = ?
       ORDER BY route_name
       LIMIT ?`
    )
    .all(stopId, limit);
  return rows.map((r) => ({ route_name: r.route_name, service_type: serviceType(r.category) }));
}

type NearbyStop = StopRow & {
  walk_m: number;
  walk_min: number;
  routes: RouteBadge[];
};

function getNearbyStops(lat: number, lng: number, radiusKm = 0.5, limit = 20): NearbyStop[] {
  if (!db) return [];
  // Bounding-box prefilter (fast), then exact haversine sort + walk-time.
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const rows = db
    .query<StopRow, [number, number, number, number, number]>(
      `SELECT stop_id, stop_code, stop_name, stop_lat, stop_lon,
        (stop_lat - ?) * (stop_lat - ?) + (stop_lon - ?) * (stop_lon - ?) AS dist_sq
       FROM stops
       WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?
       ORDER BY dist_sq
       LIMIT ?`
    )
    .all(lat, lat, lng, lng, lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta, limit);

  return rows
    .map((s) => {
      const walk_m = haversineM(lat, lng, s.stop_lat, s.stop_lon);
      return {
        ...s,
        walk_m: Math.round(walk_m),
        walk_min: Math.max(1, Math.round(walk_m / 80)), // ~80 m/min walking pace
        routes: getStopRoutes(s.stop_id),
      };
    })
    .sort((a, b) => a.walk_m - b.walk_m);
}

// ── Line detail (route shape + ordered stop timeline + direction toggle) ───────

type LineRow = { route_id: string; route_name: string; category: string };

function getLines(): (LineRow & { service_type: "feeder" | "trunk" })[] {
  if (!db) return [];
  const rows = db
    .query<LineRow, []>(
      `SELECT route_id,
        COALESCE(NULLIF(route_short_name,''), NULLIF(route_long_name,''), route_id) AS route_name,
        category
       FROM routes
       ORDER BY route_name`
    )
    .all();
  return rows.map((r) => ({ ...r, service_type: serviceType(r.category) }));
}

type LineStop = {
  stop_id: string;
  stop_code: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  stop_sequence: number;
};

function getLineDetail(routeId: string) {
  if (!db) return null;
  const route = db
    .query<LineRow, [string]>(
      `SELECT route_id,
        COALESCE(NULLIF(route_short_name,''), NULLIF(route_long_name,''), route_id) AS route_name,
        category
       FROM routes WHERE route_id = ?`
    )
    .get(routeId);
  if (!route) return null;

  const dirs = db
    .query<{ direction_id: number }, [string]>(
      `SELECT DISTINCT direction_id FROM trips WHERE route_id = ? ORDER BY direction_id`
    )
    .all(routeId);

  const directions = dirs.map((d) => {
    // Representative trip for this direction = the one visiting the most stops.
    const rep = db
      .query<{ trip_id: string; trip_headsign: string; shape_id: string; nstops: number }, [string, number]>(
        `SELECT t.trip_id, t.trip_headsign, t.shape_id, COUNT(st.id) AS nstops
         FROM trips t JOIN stop_times st ON st.trip_id = t.trip_id
         WHERE t.route_id = ? AND t.direction_id = ?
         GROUP BY t.trip_id ORDER BY nstops DESC LIMIT 1`
      )
      .get(routeId, d.direction_id);
    if (!rep) return { direction_id: d.direction_id, headsign: "", stops: [], shape: [] };

    const stops = db
      .query<LineStop, [string]>(
        `SELECT s.stop_id, s.stop_code, s.stop_name, s.stop_lat, s.stop_lon, st.stop_sequence
         FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id
         WHERE st.trip_id = ? ORDER BY st.stop_sequence`
      )
      .all(rep.trip_id);

    const shape = rep.shape_id
      ? db
          .query<{ shape_pt_lat: number; shape_pt_lon: number }, [string]>(
            `SELECT shape_pt_lat, shape_pt_lon FROM shapes WHERE shape_id = ? ORDER BY shape_pt_sequence`
          )
          .all(rep.shape_id)
          .map((p) => [p.shape_pt_lat, p.shape_pt_lon] as [number, number])
      : [];

    return {
      direction_id: d.direction_id,
      headsign: rep.trip_headsign,
      stops,
      shape,
    };
  });

  return {
    route_id: route.route_id,
    route_name: route.route_name,
    service_type: serviceType(route.category),
    directions,
  };
}

// ── Server ────────────────────────────────────────────────────────────────────

openDb();
await fetchVehicles().catch(console.error);
setInterval(() => fetchVehicles().catch(console.error), POLL_INTERVAL_MS);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // GET /health
    if (url.pathname === "/health") {
      return Response.json(
        {
          ok: true,
          fetchedAt: state.fetchedAt,
          vehicleCount: state.vehicles.length,
          dbLoaded: db !== null,
          sseClients: sseClients.size,
        },
        { headers: CORS }
      );
    }

    // GET /vehicles — all vehicle positions as GeoJSON FeatureCollection
    if (url.pathname === "/vehicles") {
      return Response.json(
        {
          type: "FeatureCollection",
          features: state.vehicles.map((v) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [v.lng, v.lat] },
            properties: v,
          })),
          fetchedAt: state.fetchedAt,
        },
        { headers: CORS }
      );
    }

    // GET /arrivals/:stopId — upcoming scheduled arrivals from GTFS static
    const arrivalMatch = url.pathname.match(/^\/arrivals\/(.+)$/);
    if (arrivalMatch) {
      const stopId = decodeURIComponent(arrivalMatch[1]);
      const arrivals = getUpcomingArrivals(stopId).map((a) => ({
        ...a,
        service_type: serviceType(a.category),
      }));
      return Response.json({ stopId, arrivals, fetchedAt: state.fetchedAt }, { headers: CORS });
    }

    // GET /lines — all routes with service type (for line browse / search)
    if (url.pathname === "/lines") {
      return Response.json({ lines: getLines() }, { headers: CORS });
    }

    // GET /route/:routeId — line detail: ordered stops + shape per direction
    const routeMatch = url.pathname.match(/^\/route\/(.+)$/);
    if (routeMatch) {
      const routeId = decodeURIComponent(routeMatch[1]);
      const detail = getLineDetail(routeId);
      if (!detail) return Response.json({ error: "route not found" }, { status: 404, headers: CORS });
      return Response.json(detail, { headers: CORS });
    }

    // GET /stops/nearby?lat=...&lng=...&radius=0.5
    if (url.pathname === "/stops/nearby") {
      const lat = parseFloat(url.searchParams.get("lat") ?? "");
      const lng = parseFloat(url.searchParams.get("lng") ?? "");
      const radius = parseFloat(url.searchParams.get("radius") ?? "0.5");
      if (isNaN(lat) || isNaN(lng)) {
        return Response.json({ error: "lat and lng required" }, { status: 400, headers: CORS });
      }
      return Response.json({ stops: getNearbyStops(lat, lng, radius) }, { headers: CORS });
    }

    // GET /stream — SSE, sends vehicle snapshot + live updates
    if (url.pathname === "/stream") {
      let ctrl: ReadableStreamDefaultController;
      const stream = new ReadableStream({
        start(controller) {
          ctrl = controller;
          sseClients.add(ctrl);
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "snapshot",
              fetchedAt: state.fetchedAt,
              vehicles: state.vehicles,
            })}\n\n`
          );
        },
        cancel() {
          sseClients.delete(ctrl);
        },
      });
      return new Response(stream, {
        headers: {
          ...CORS,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
});

console.log(`GTFS-RT proxy on http://localhost:${PORT}`);
