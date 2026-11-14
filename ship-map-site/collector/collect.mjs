// Listens to aisstream.io for a long stretch and keeps OUT_FILE (snapshot.json)
// up to date every few seconds. The workflow publishes that file once a minute.
import WebSocket from "ws";
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.AISSTREAM_API_KEY;
if (!KEY) { console.error("AISSTREAM_API_KEY is not set"); process.exit(1); }

const FILE = process.env.OUT_FILE || "data/snapshot.json";
const DURATION = (Number(process.env.DURATION_SEC) || 230) * 1000;
const MAX_AGE = 12 * 60 * 60 * 1000;          // forget ships not heard for 12 hours
const BBOX = [[18, 120], [46, 150]];           // south-west, north-east (lat, lon): Japan and its seas

const ships = new Map();

// ---- load the previous snapshot ----
try {
  const prev = JSON.parse(fs.readFileSync(FILE, "utf8"));
  for (const r of prev.ships) {
    ships.set(String(r[0]), {
      lat: r[1], lon: r[2], t: r[3],
      name: r[4] || undefined,
      type: r[5] >= 0 ? r[5] : undefined,
      sog: r[6] >= 0 ? r[6] : undefined,
      cog: r[7] >= 0 ? r[7] : undefined,
      hdg: r[8] >= 0 ? r[8] : undefined,
      dest: r[9] || undefined,
      len: r[10] || undefined,
      nav: r[11] >= 0 ? r[11] : undefined
    });
  }
  console.log("previous snapshot:", ships.size, "ships");
} catch {
  console.log("no previous snapshot");
}

let received = 0;
let authError = null;
const startedAt = Date.now();

function validPos(lat, lon) {
  return typeof lat === "number" && typeof lon === "number" &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}

function handle(raw) {
  let m;
  try { m = JSON.parse(raw.toString()); } catch { return; }
  if (m.error) { authError = String(m.error); return; }
  const meta = m.MetaData || {};
  const mmsi = meta.MMSI;
  if (!mmsi) return;
  const key = String(mmsi);
  const s = ships.get(key) || {};
  if (meta.ShipName && meta.ShipName.trim()) s.name = meta.ShipName.trim();

  if (m.MessageType === "PositionReport" && m.Message && m.Message.PositionReport) {
    const p = m.Message.PositionReport;
    const lat = p.Latitude !== undefined ? p.Latitude : meta.latitude;
    const lon = p.Longitude !== undefined ? p.Longitude : meta.longitude;
    if (!validPos(lat, lon)) return;
    s.lat = lat; s.lon = lon; s.t = Date.now();
    s.sog = p.Sog; s.cog = p.Cog; s.hdg = p.TrueHeading; s.nav = p.NavigationalStatus;
  } else if (m.MessageType === "ShipStaticData" && m.Message && m.Message.ShipStaticData) {
    const d = m.Message.ShipStaticData;
    if (d.Type !== undefined) s.type = d.Type;
    if (d.Name && d.Name.trim()) s.name = d.Name.trim();
    if (d.Destination && d.Destination.trim()) s.dest = d.Destination.trim();
    if (d.Dimension) s.len = (d.Dimension.A || 0) + (d.Dimension.B || 0);
  } else {
    return;
  }
  if (s.lat === undefined) return;     // static data for a ship we have never seen moving
  ships.set(key, s);
  received++;
}

function writeSnapshot() {
  const now = Date.now();
  const rows = [];
  for (const [mmsi, s] of ships) {
    if (now - s.t > MAX_AGE) continue;
    rows.push([
      Number(mmsi), s.lat, s.lon, s.t, s.name || "",
      s.type === undefined ? -1 : s.type,
      s.sog === undefined ? -1 : s.sog,
      s.cog === undefined ? -1 : s.cog,
      s.hdg === undefined ? -1 : s.hdg,
      s.dest || "", s.len || 0,
      s.nav === undefined ? -1 : s.nav
    ]);
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ generated: now, ships: rows }));
  fs.renameSync(tmp, FILE);
  return rows.length;
}

function listen() {
  return new Promise((resolve) => {
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    ws.on("open", () => {
      ws.send(JSON.stringify({
        APIKey: KEY,
        BoundingBoxes: [BBOX],
        FilterMessageTypes: ["PositionReport", "ShipStaticData"]
      }));
    });
    ws.on("message", handle);
    ws.on("error", (e) => console.error("socket error:", e.message));
    ws.on("close", finish);
    const left = DURATION - (Date.now() - startedAt);
    setTimeout(() => { try { ws.close(); } catch {} finish(); }, Math.max(left, 1000));
  });
}

// save every 20 seconds while listening, so the publisher always has fresh data
const saver = setInterval(() => { try { writeSnapshot(); } catch (e) { console.error("write failed:", e.message); } }, 20000);

while (Date.now() - startedAt < DURATION - 2000 && !authError) {
  await listen();
  if (Date.now() - startedAt < DURATION - 2000 && !authError) {
    console.log("connection closed early, retrying in 3s");
    await new Promise((r) => setTimeout(r, 3000));
  }
}
clearInterval(saver);

const n = writeSnapshot();
console.log("heard", received, "messages; wrote", n, "ships");

if (authError && received === 0) {
  console.error("aisstream error:", authError);
  process.exit(1);
}
