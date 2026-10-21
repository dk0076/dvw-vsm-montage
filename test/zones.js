'use strict';
/* The .dvw zone grid, pinned two ways.

   The grid is not a convention anyone wrote down for this program — it was
   read off 103,793 touches across 135 VolleyMetrics files that carry zones and
   measured coordinates together, and on a VolleyStation file it is the only
   thing standing between a coded play and no position at all. Two different
   failures can take it away, so there are two checks:

   1. The grid itself, pinned exactly. Catches an edited constant, a swapped
      axis, a subzone offset flipped in sign. Runs with no fixtures.

   2. Agreement with the measurements it was calibrated against. Catches the
      grid drifting away from the court it is meant to describe, which an exact
      table cannot: the numbers could be edited consistently and still be
      wrong. Needs a coordinate-bearing fixture and skips without one.

   Thresholds in (2) are deliberately looser than the observed values, so
   swapping in a different VolleyMetrics match does not fail the suite. They
   are tight enough that the breakages worth worrying about do fail: see
   README on what was tried. */

const fs = require('fs');
const path = require('path');
const { loadParser } = require('../tools/extract-parser');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const { parseDvw, dvwZonePoint, dvwZoneStart, lane, LANE_NAME, COURT } = loadParser();

let failures = 0;
let checks = 0;

function eq(label, actual, expected){
  checks++;
  if (actual === expected) return;
  failures++;
  console.log(`  FAIL ${label}: got ${actual}, expected ${expected}`);
}

function ok(label, cond, detail){
  checks++;
  if (cond) return;
  failures++;
  console.log(`  FAIL ${label}${detail ? ': ' + detail : ''}`);
}

/* ── 1. the grid, pinned ─────────────────────────────────────
   net at the top, endline at the bottom, x left to right:

        4   3   2     y 1050
        7   8   9     y 1350
        5   6   1     y 1650
        x 750 450 150

   and each zone quarters into A low x far from the net, B low x near it,
   C high x near it, D high x far from it. */
const CENTRES = {
  4: [750, 1050], 3: [450, 1050], 2: [150, 1050],
  7: [750, 1350], 8: [450, 1350], 9: [150, 1350],
  5: [750, 1650], 6: [450, 1650], 1: [150, 1650],
};
const OFFSETS = { A: [-75, 75], B: [-75, -75], C: [75, -75], D: [75, 75] };

console.log('zone grid');
for (const [z, [cx, cy]] of Object.entries(CENTRES)){
  const p = dvwZonePoint(+z, null);
  ok(`zone ${z} resolves`, !!p);
  if (!p) continue;
  eq(`zone ${z} x`, p.x, cx);
  eq(`zone ${z} y`, p.y, cy);
  for (const [sub, [dx, dy]] of Object.entries(OFFSETS)){
    const s = dvwZonePoint(+z, sub);
    eq(`zone ${z}${sub} x`, s.x, cx + dx);
    eq(`zone ${z}${sub} y`, s.y, cy + dy);
  }
}

/* Structure, so a consistent-looking edit that breaks the geometry still
   fails: the bands have to stay 300 apart and inside the far half. */
const xs = [...new Set(Object.values(CENTRES).map(c => c[0]))].sort((a, b) => a - b);
const ys = [...new Set(Object.values(CENTRES).map(c => c[1]))].sort((a, b) => a - b);
eq('three x bands', xs.length, 3);
eq('three y bands', ys.length, 3);
eq('x bands 300 apart', xs[1] - xs[0] === 300 && xs[2] - xs[1] === 300, true);
eq('y bands 300 apart', ys[1] - ys[0] === 300 && ys[2] - ys[1] === 300, true);
ok('every zone sits in the far half, inside the lines',
   Object.values(CENTRES).every(([x, y]) =>
     x > 0 && x < COURT.w && y > COURT.net && y < COURT.len));
ok('no subzone leaves the court',
   Object.values(CENTRES).every(([x, y]) =>
     Object.values(OFFSETS).every(([dx, dy]) =>
       x + dx > 0 && x + dx < COURT.w && y + dy > COURT.net && y + dy < COURT.len)));

/* A start zone is the far half turned 180° about the centre of the net. */
for (const z of Object.keys(CENTRES)){
  const far = dvwZonePoint(+z, null), own = dvwZoneStart(+z);
  eq(`start zone ${z} mirrors x`, own.x, COURT.w - far.x);
  eq(`start zone ${z} mirrors y`, own.y, COURT.len - far.y);
  ok(`start zone ${z} lands on the own side`, own.y < COURT.net);
}

/* Nothing outside 1..9 is a zone. A numeric string is not in this list:
   dvwCode only ever passes a number, and resolving '4' through an object key
   is ordinary JavaScript rather than something to guard against. */
for (const bad of [null, undefined, 0, 10, -1, 'A', '', NaN])
  eq(`zone ${JSON.stringify(bad) ?? String(bad)} rejected`, dvwZonePoint(bad, null), null);

/* An unknown subzone letter falls back to the zone centre rather than
   shifting the point somewhere arbitrary. */
for (const sub of ['E', 'a', '', null])
  eq(`subzone ${JSON.stringify(sub) ?? String(sub)} -> zone centre`,
     JSON.stringify(dvwZonePoint(8, sub)), JSON.stringify(dvwZonePoint(8, null)));

/* ── 2. agreement with the measurements ──────────────────────  */

const MIN_PAIRS      = 300;    // below this the sample says nothing
const MAX_MEDIAN_M   = 0.85;   // observed 0.63 on this fixture, 0.66 over 135 files
const MAX_P90_M      = 1.60;   // observed 1.26
const MIN_SAME_THIRD = 93;     // observed 96.8%, 96.5% over 135 files
const MIN_SAME_DEPTH = 82;     // observed 86.7%, 89.0% over 135 files

const depthBand = y => {
  const d = (y - COURT.net) / COURT.m;
  return d < 0 ? 'own' : d < 3 ? 'short' : d <= 6 ? 'mid' : 'deep';
};
const inCourt = p => p.x >= 0 && p.x <= COURT.w && p.y >= 0 && p.y <= COURT.len;

const coordFixtures = fs.existsSync(FIXTURES)
  ? fs.readdirSync(FIXTURES).filter(f => f.toLowerCase().endsWith('.dvw'))
  : [];

const err = [];
let pairs = 0, both = 0, sameThird = 0, sameDepth = 0;

for (const f of coordFixtures){
  let M;
  try { M = parseDvw(fs.readFileSync(path.join(FIXTURES, f), 'latin1').replace(/^﻿/, ''), f); }
  catch { continue; }                       // a file this suite cannot parse is smoke.js's problem
  for (const p of M.plays){
    if (!(p.path && p.path.length >= 2) || p.endZone == null) continue;
    const measured = p.path[p.path.length - 1];
    const zone = dvwZonePoint(p.endZone, p.endSubZone);
    if (!zone) continue;
    pairs++;
    err.push(Math.hypot(zone.x - measured.x, zone.y - measured.y) / COURT.m);
    if (!(inCourt(measured) && inCourt(zone))) continue;
    both++;
    if (LANE_NAME[lane(measured.x)] === LANE_NAME[lane(zone.x)]) sameThird++;
    if (depthBand(measured.y) === depthBand(zone.y)) sameDepth++;
  }
}

console.log('\nagreement with measured landings');
if (pairs < MIN_PAIRS){
  console.log(`  SKIP  only ${pairs} measured-end/end-zone pairs in fixtures/` +
              ` (need ${MIN_PAIRS}). A VolleyMetrics .dvw carries both;` +
              ` a VolleyStation one carries no coordinates at all.`);
} else {
  err.sort((a, b) => a - b);
  const median = err[err.length >> 1];
  const p90 = err[Math.floor(err.length * 0.9)];
  const third = 100 * sameThird / both;
  const depth = 100 * sameDepth / both;
  console.log(`  ${pairs} pairs, ${both} with both inside the court`);
  console.log(`  median ${median.toFixed(2)} m, 90th ${p90.toFixed(2)} m, ` +
              `same third ${third.toFixed(1)}%, same depth ${depth.toFixed(1)}%`);
  ok('median error within bound', median <= MAX_MEDIAN_M,
     `${median.toFixed(2)} m > ${MAX_MEDIAN_M} m`);
  ok('90th percentile error within bound', p90 <= MAX_P90_M,
     `${p90.toFixed(2)} m > ${MAX_P90_M} m`);
  ok('agrees on court third', third >= MIN_SAME_THIRD,
     `${third.toFixed(1)}% < ${MIN_SAME_THIRD}%`);
  ok('agrees on depth band', depth >= MIN_SAME_DEPTH,
     `${depth.toFixed(1)}% < ${MIN_SAME_DEPTH}%`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
