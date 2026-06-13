/**
 * One-off backfill: populate the `shapes` table from GTFS zips already on disk,
 * without re-downloading (avoids the data.gov.my rate limit + the large
 * rapid-bus-kl download). Run once after adding shapes support to the schema:
 *   bun run scripts/backfill-shapes.ts
 *
 * Picks up every data/*.zip whose name maps to a known category. Future full
 * syncs (sync-gtfs.ts) handle shapes natively, so this is only for catching the
 * existing DB up in place.
 */

import { Database } from "bun:sqlite";
import { unzipSync } from "fflate";
import * as path from "path";
import * as fs from "fs";

const DATA_DIR = path.join(import.meta.dir, "data");
const DB_PATH = path.join(DATA_DIR, "gtfs.db");

// Map on-disk zip filename → GTFS category tag used elsewhere in the schema.
const ZIP_CATEGORY: Record<string, string> = {
  "prasarana-mrtfeeder.zip": "rapid-bus-mrtfeeder",
  "prasarana-kl.zip": "rapid-bus-kl",
};

function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(","));
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

const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS shapes (
    shape_id TEXT NOT NULL,
    shape_pt_lat REAL NOT NULL,
    shape_pt_lon REAL NOT NULL,
    shape_pt_sequence INTEGER NOT NULL,
    category TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_shapes_shape_id ON shapes(shape_id);
`);

const decoder = new TextDecoder();

for (const [zipName, category] of Object.entries(ZIP_CATEGORY)) {
  const zipPath = path.join(DATA_DIR, zipName);
  if (!fs.existsSync(zipPath)) {
    console.log(`Skipping ${zipName} (not on disk)`);
    continue;
  }
  const files = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  const shapesTxt = files["shapes.txt"];
  if (!shapesTxt) {
    console.log(`No shapes.txt in ${zipName}`);
    continue;
  }
  const rows = csvToObjects(decoder.decode(shapesTxt));
  console.log(`Backfilling ${rows.length} shape points for ${category}...`);
  db.transaction(() => {
    db.run(`DELETE FROM shapes WHERE category = ?`, [category]);
    const insert = db.prepare(
      `INSERT INTO shapes (shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence, category) VALUES (?,?,?,?,?)`
    );
    for (const r of rows) {
      insert.run(
        r.shape_id,
        Number(r.shape_pt_lat),
        Number(r.shape_pt_lon),
        Number(r.shape_pt_sequence),
        category
      );
    }
  })();
}

const n = db.query<{ n: number }, []>("SELECT count(*) as n FROM shapes").get()!.n;
const distinct = db.query<{ n: number }, []>("SELECT count(DISTINCT shape_id) as n FROM shapes").get()!.n;
console.log(`Done. shapes table: ${n} points across ${distinct} shapes.`);
db.close();
