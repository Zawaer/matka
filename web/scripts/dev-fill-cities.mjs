#!/usr/bin/env node
// DEV ONLY. Fills places.city/country on a local database where Photon isn't
// available, from a short hand-written list of towns: each place gets the
// nearest town within 60 km. Nothing leaves the machine; never run this on a
// real deployment (the geocoder fills these columns there).
//
//   DATABASE_URL=postgresql://… node scripts/dev-fill-cities.mjs [--force]
import pg from "pg";

const TOWNS = [
  // Finland
  ["Helsinki", "Finland", 60.17, 24.94],
  ["Espoo", "Finland", 60.205, 24.66],
  ["Vantaa", "Finland", 60.294, 25.04],
  ["Kirkkonummi", "Finland", 60.12, 24.44],
  ["Lohja", "Finland", 60.25, 24.07],
  ["Sipoo", "Finland", 60.38, 25.27],
  ["Porvoo", "Finland", 60.39, 25.66],
  ["Kerava", "Finland", 60.4, 25.1],
  ["Hyvinkää", "Finland", 60.63, 24.86],
  ["Hämeenlinna", "Finland", 61.0, 24.46],
  ["Hollola", "Finland", 60.99, 25.4],
  ["Lahti", "Finland", 60.98, 25.66],
  ["Kouvola", "Finland", 60.87, 26.7],
  ["Tampere", "Finland", 61.5, 23.76],
  ["Ikaalinen", "Finland", 61.77, 23.07],
  ["Jämsä", "Finland", 61.86, 25.19],
  ["Petäjävesi", "Finland", 62.25, 25.19],
  ["Jyväskylä", "Finland", 62.24, 25.75],
  ["Kyyjärvi", "Finland", 63.04, 24.56],
  ["Seinäjoki", "Finland", 62.79, 22.84],
  ["Kauhava", "Finland", 63.1, 23.06],
  ["Vaasa", "Finland", 63.1, 21.62],
  ["Kokkola", "Finland", 63.84, 23.13],
  ["Keitele", "Finland", 63.18, 26.35],
  ["Parikkala", "Finland", 61.55, 29.5],
  ["Kitee", "Finland", 62.1, 30.14],
  ["Tolosenmäki", "Finland", 62.14, 30.03],
  ["Oulu", "Finland", 65.01, 25.47],
  ["Rovaniemi", "Finland", 66.5, 25.73],
  ["Kemijärvi", "Finland", 66.71, 27.43],
  ["Pelkosenniemi", "Finland", 67.0, 27.25],
  ["Sodankylä", "Finland", 67.15, 26.9],
  ["Mariehamn", "Finland", 60.1, 19.94],
  // Estonia
  ["Tallinn", "Estonia", 59.44, 24.75],
  ["Viimsi", "Estonia", 59.5, 24.95],
  ["Pärnu", "Estonia", 58.39, 24.5],
  ["Põltsamaa", "Estonia", 58.65, 25.97],
  // Sweden
  ["Stockholm", "Sweden", 59.33, 18.07],
  ["Haninge", "Sweden", 59.17, 18.14],
  ["Nynäshamn", "Sweden", 58.9, 17.95],
  ["Sigtuna", "Sweden", 59.62, 17.85],
  ["Visby", "Sweden", 57.64, 18.3],
  ["Klintehamn", "Sweden", 57.39, 18.2],
  ["Hemse", "Sweden", 57.24, 18.37],
  ["Tingstäde", "Sweden", 57.78, 18.55],
  ["Fårösund", "Sweden", 57.86, 19.06],
];

function km(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.hypot(x, y) * 6371;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const force = process.argv.includes("--force");
const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows } = await client.query(
  `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon FROM places
   ${force ? "" : "WHERE city IS NULL"}`,
);
let filled = 0;
for (const p of rows) {
  let best = null;
  for (const [city, country, lat, lon] of TOWNS) {
    const d = km(p.lat, p.lon, lat, lon);
    if (d < 60 && (!best || d < best.d)) best = { city, country, d };
  }
  if (!best) continue;
  await client.query(`UPDATE places SET city = $2, country = $3 WHERE id = $1`, [p.id, best.city, best.country]);
  filled++;
}
console.log(`dev-fill-cities: ${filled} of ${rows.length} places filled`);
await client.end();
