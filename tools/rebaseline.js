'use strict';
/* Regenerate test/expected.json from whatever is currently in fixtures/.

   Run this only when a fixture has deliberately changed. Running it to make a
   failing test pass rewrites the baseline to match the bug, which is the one
   way this suite can be made useless. */

const fs = require('fs');
const path = require('path');
const { loadParser } = require('./extract-parser');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const EXPECTED = path.join(__dirname, '..', 'test', 'expected.json');

const { parseDvw } = loadParser();
const previous = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'));

const out = previous.map(e => {
  const p = path.join(FIXTURES, e.file);
  if (!fs.existsSync(p)){
    console.log(`kept  ${e.file} (not present)`);
    return e;
  }
  const M = parseDvw(fs.readFileSync(p, 'latin1').replace(/^﻿/, ''), e.file);
  const row = {
    file: e.file,
    note: e.note,
    plays: M.plays.length,
    rallies: M.rallies.length,
    sets: [...new Set(M.plays.map(p => p.set))].sort((a, b) => a - b).join(','),
    coords: M.plays.filter(p => p.path.length).length,
    rosters: `${M.rosters['*'].length}/${M.rosters.a.length}`,
  };
  const changed = Object.keys(row).filter(k => String(row[k]) !== String(e[k]));
  console.log(changed.length
    ? `UPDATED ${e.file}: ${changed.map(k => `${k} ${e[k]} -> ${row[k]}`).join(', ')}`
    : `same  ${e.file}`);
  return row;
});

fs.writeFileSync(EXPECTED, JSON.stringify(out, null, 2) + '\n');
