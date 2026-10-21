'use strict';
/* Golden-file smoke test for the .dvw parser inside montage.html.

   A parse that shifts by one column still produces output that looks like
   volleyball, so plausibility is not the bar. These assertions pin the numbers
   that a column shift would move: how many touches came out, whether any were
   dropped, how the rallies grouped, rotation coverage, and which half of the
   court attacks land in.

   Fixtures are not in the repo. See fixtures/README.md. */

const fs = require('fs');
const path = require('path');
const { loadParser } = require('../tools/extract-parser');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const EXPECTED = path.join(__dirname, 'expected.json');

const { parseDvw, dvwSection, COURT } = loadParser();

let failures = 0;
let checks = 0;

function eq(label, actual, expected){
  checks++;
  if (actual === expected) return;
  failures++;
  console.log(`  FAIL ${label}: got ${actual}, expected ${expected}`);
}

/* Rows in [3SCOUT] that are a real touch by a numbered player. Every one of
   these should survive into M.plays; a silent drop is the failure this catches. */
const touchRows = text =>
  dvwSection(text.split(/\r?\n/), '3SCOUT')
    .filter(r => /^[*a]\d\d[SRAEBDF]/.test(r[0] || '')).length;

const expected = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'));
const present = expected.filter(e => fs.existsSync(path.join(FIXTURES, e.file)));

if (!present.length){
  console.log('SKIP  no fixtures present. See fixtures/README.md for what to drop in.');
  process.exit(0);
}

for (const e of expected){
  const p = path.join(FIXTURES, e.file);
  if (!fs.existsSync(p)){
    console.log(`SKIP  ${e.file} (not present)`);
    continue;
  }
  console.log(`\n${e.file}  — ${e.note}`);
  const text = fs.readFileSync(p, 'latin1').replace(/^﻿/, '');
  let M;
  try {
    M = parseDvw(text, e.file);
  } catch (err){
    checks++; failures++;
    console.log(`  FAIL parseDvw threw: ${err.message}`);
    continue;
  }

  eq('plays', M.plays.length, e.plays);
  eq('touch rows dropped', touchRows(text) - M.plays.length, 0);
  eq('rallies', M.rallies.length, e.rallies);
  eq('sets', [...new Set(M.plays.map(p => p.set))].sort((a, b) => a - b).join(','), e.sets);
  eq('rotation coverage', M.plays.filter(p => p.rot).length, e.plays);
  eq('rotation values', [...new Set(M.plays.map(p => p.rot))].sort((a, b) => a - b).join(','), '1,2,3,4,5,6');
  eq('plays with coordinates', M.plays.filter(p => p.path.length).length, e.coords);
  eq('roster sizes', `${M.rosters['*'].length}/${M.rosters.a.length}`, e.rosters);

  /* Orientation guard. These files are written pre-oriented to the acting team,
     so both teams' attacks end in the far half and orientDvw must leave them
     alone. A mirrored chart for one team only shows up here as this number
     splitting roughly in half. */
  if (e.coords){
    const ends = M.plays.filter(p => p.skill === 'A' && p.path.length)
                        .map(p => p.path[p.path.length - 1].y);
    const far = ends.filter(y => y > COURT.net).length;
    checks++;
    if (far / ends.length < 0.95){
      failures++;
      console.log(`  FAIL attack ends in far half: ${far}/${ends.length} (expected >95%)`);
    }
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
