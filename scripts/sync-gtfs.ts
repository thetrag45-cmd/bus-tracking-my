/**
 * Syncs GTFS static data from data.gov.my into a SQLite database.
 * Run: bun run scripts/sync-gtfs.ts
 * Recommended: run daily at 4am before service starts.
 */

import { Database } from "bun:sqlite";
import { unzipSync } from "fflate";
import * as path from "path";
import * as fs from "fs";

const CATEGORIES = [
  "rapid-bus-mrtfeeder",
  "rapid-bus-kl",
] as const;

const DB_PATH = path.join(import.meta.dir, "data/gtfs.db");
const DATA_DIR = path.join(import.meta.dir, "data");

fs.mkdirSync(DATA_DIR, { recursive: true });

async function downloadCategory(category: string): Promise<Uint8Array> {
  console.log(`Downloading GTFS static for ${category}...`);
  const res = await fetch(
    `https://api.data.gov.my/gtfs-static/prasarana?category=${category}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${category}`);
  const buf = await res.arrayBuffer();
  console.log(`  Downloaded ${(buf.byteLength / 1024).toFixed(0)}KB`);
  return new Uint8Array(buf);
}

function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { cells.push(cur); cur = ""; }
      else { cur += ch; }
    }
    cells.push(cur);
    return cells;
  });
  return { headers, rows };
}

function csvToObjects(content: string): Record<string, string>[] {
  const { headers, rows } = parseCSV(content);
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i]?.trim() ?? ""; });
    return obj;
  });
}

function setupSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agency (
      agency_id TEXT PRIMARY KEY,
      agency_name TEXT,
      agency_url TEXT,
      agency_timezone TEXT
    );

    CREATE TABLE IF NOT EXISTS routes (
      route_id TEXT PRIMARY KEY,
      agency_id TEXT,
      route_short_name TEXT,
      route_long_name TEXT,
      route_type INTEGER,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS stops (
      stop_id TEXT PRIMARY KEY,
      stop_code TEXT,
      stop_name TEXT,
      stop_lat REAL,
      stop_lon REAL
    );

    CREATE TABLE IF NOT EXISTS trips (
      trip_id TEXT PRIMARY KEY,
      route_id TEXT,
      service_id TEXT,
      trip_headsign TEXT,
      direction_id INTEGER,
      shape_id TEXT
    );

    CREATE TABLE IF NOT EXISTS stop_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      stop_id TEXT NOT NULL,
      stop_sequence INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar (
      service_id TEXT PRIMARY KEY,
      monday INTEGER, tuesday INTEGER, wednesday INTEGER,
      thursday INTEGER, friday INTEGER, saturday INTEGER, sunday INTEGER,
      start_date TEXT, end_date TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_stop_times_stop_id ON stop_times(stop_id);
    CREATE INDEX IF NOT EXISTS idx_stop_times_trip_id ON stop_times(trip_id);
    CREATE INDEX IF NOT EXISTS idx_trips_route_id ON trips(route_id);
  `);
}

function clearCategory(db: Database, category: string) {
  // Delete routes for this category, cascade through trips/stop_times
  const routeIds = db
    .query<{ route_id: string }, []>(
      "SELECT route_id FROM routes WHERE category = ?"
    )
    .all(category)
    .map((r) => r.route_id);

  if (routeIds.length > 0) {
    const placeholders = routeIds.map(() => "?").join(",");
    const tripIds = db
      .query<{ trip_id: string }, string[]>(
        `SELECT trip_id FROM trips WHERE route_id IN (${placeholders})`
      )
      .all(...routeIds)
      .map((t) => t.trip_id);

    if (tripIds.length > 0) {
      const tp = tripIds.map(() => "?").join(",");
      db.run(`DELETE FROM stop_times WHERE trip_id IN (${tp})`, tripIds);
      db.run(`DELETE FROM trips WHERE trip_id IN (${tp})`, tripIds);
    }
    db.run(`DELETE FROM routes WHERE category = ?`, [category]);
  }
}

async function syncCategory(db: Database, category: string) {
  const zipBytes = await downloadCategory(category);
  const files = unzipSync(zipBytes);

  const decoder = new TextDecoder();
  const text = (name: string) => decoder.decode(files[name] ?? new Uint8Array());

  db.transaction(() => {
    clearCategory(db, category);

    // agency
    for (const row of csvToObjects(text("agency.txt"))) {
      db.run(
        `INSERT OR REPLACE INTO agency VALUES (?,?,?,?)`,
        [row.agency_id, row.agency_name, row.agency_url, row.agency_timezone]
      );
    }

    // routes
    for (const row of csvToObjects(text("routes.txt"))) {
      db.run(
        `INSERT OR REPLACE INTO routes VALUES (?,?,?,?,?,?)`,
        [row.route_id, row.agency_id, row.route_short_name, row.route_long_name, Number(row.route_type), category]
      );
    }

    // stops (upsert — shared across categories)
    for (const row of csvToObjects(text("stops.txt"))) {
      db.run(
        `INSERT OR REPLACE INTO stops VALUES (?,?,?,?,?)`,
        [row.stop_id, row.stop_code, row.stop_name, Number(row.stop_lat), Number(row.stop_lon)]
      );
    }

    // calendar
    for (const row of csvToObjects(text("calendar.txt"))) {
      db.run(
        `INSERT OR REPLACE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [row.service_id, Number(row.monday), Number(row.tuesday), Number(row.wednesday),
         Number(row.thursday), Number(row.friday), Number(row.saturday), Number(row.sunday),
         row.start_date, row.end_date]
      );
    }

    // trips
    const tripRows = csvToObjects(text("trips.txt"));
    for (const row of tripRows) {
      db.run(
        `INSERT OR REPLACE INTO trips VALUES (?,?,?,?,?,?)`,
        [row.trip_id, row.route_id, row.service_id, row.trip_headsign, Number(row.direction_id), row.shape_id]
      );
    }

    // stop_times — bulk insert
    const stopTimeRows = csvToObjects(text("stop_times.txt"));
    console.log(`  Inserting ${stopTimeRows.length} stop times for ${category}...`);
    const insertSt = db.prepare(
      `INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence) VALUES (?,?,?,?,?)`
    );
    for (const row of stopTimeRows) {
      insertSt.run(row.trip_id, row.arrival_time, row.departure_time, row.stop_id, Number(row.stop_sequence));
    }
  })();

  console.log(`  Synced ${category}: ${csvToObjects(text("stops.txt")).length} stops, ${csvToObjects(text("trips.txt")).length} trips`);
}

async function main() {
  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
  setupSchema(db);

  for (const cat of CATEGORIES) {
    await syncCategory(db, cat);
    // Respect 4 req/min rate limit — wait 20s between categories
    if (cat !== CATEGORIES[CATEGORIES.length - 1]) {
      console.log("Waiting 20s for rate limit...");
      await Bun.sleep(20_000);
    }
  }

  const stopCount = db.query<{ n: number }, []>("SELECT count(*) as n FROM stops").get()!.n;
  const tripCount = db.query<{ n: number }, []>("SELECT count(*) as n FROM trips").get()!.n;
  const stCount = db.query<{ n: number }, []>("SELECT count(*) as n FROM stop_times").get()!.n;
  console.log(`\nSync complete. DB: ${stopCount} stops, ${tripCount} trips, ${stCount} stop times`);
  console.log(`DB saved to: ${DB_PATH}`);

  db.close();
}

await main();
