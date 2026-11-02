'use strict';
/* Pull the .dvw parser out of montage.html and return it as a module.

   The point of slicing the live HTML rather than keeping a second copy of the
   parser is that the copy would drift. The test suite exercises the code the
   coach actually runs. Slices are located by marker text, not line number, so
   editing montage.html above or below them does not break this. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'montage.html');

/* Text from the line that starts with `from` up to, but not including, the
   line that starts with `to`. */
function slice(src, from, to){
  const i = src.indexOf(from);
  if (i < 0) throw new Error(`marker not found in montage.html: ${from}`);
  const j = src.indexOf(to, i);
  if (j < 0) throw new Error(`end marker not found after ${from}: ${to}`);
  return src.slice(i, j);
}

const EXPORTS = ['COURT', 'dvwPoint', 'dvwZonePoint', 'dvwZoneStart', 'orientDvw',
                 'lane', 'LANE_NAME', 'attackDirection', 'deriveGeometry',
                 'dvwSection', 'dvwCode', 'parseDvw'];

function loadParser(file = APP){
  /* utf8, not latin1: the third slice ends on a comment rule drawn with
     box-drawing characters, and under latin1 that marker never matches. */
  const src = fs.readFileSync(file, 'utf8');
  /* Kept in declaration order, so nothing references a const before it is
     evaluated — deriveGeometry reads dvwZonePoint out of the first slice. */
  const code = [
    slice(src, 'const COURT = {', 'const lane ='),         // COURT, dvwPoint, zones, orientDvw
    slice(src, 'const lane = x =>', '/* ── code vocabulary'), // lane, attackDirection, deriveGeometry
    slice(src, 'const DVW_SKILLS =', 'function parseVsm'),  // dvwSection, dvwCode, parseDvw
  ].join('\n');

  const sandbox = { console };
  vm.createContext(sandbox);
  const pick = `({ ${EXPORTS.join(', ')} })`;
  vm.runInContext(code + '\n;' + pick + ';', sandbox, { filename: 'montage.html:dvw' });
  return vm.runInContext(pick, sandbox);
}

/* The filename pairing rules. autoPair reads S.sources and S.videos and writes
   the pairing back onto them, so `pair` hands in a stub and returns it. Sliced
   rather than reimplemented for the same reason as the parser: a second copy
   of the scoring would agree with itself while disagreeing with the app. */
function loadPairing(file = APP){
  const src = fs.readFileSync(file, 'utf8');
  const code = slice(src, 'const PAIR = {', 'function measureVideos');

  const sandbox = { console, S: { sources: [], videos: [] } };
  vm.createContext(sandbox);
  const pick = '({ PAIR, pairTokens, pairDate, pairIds, pairScore, autoPair })';
  vm.runInContext(code + '\n;' + pick + ';', sandbox, { filename: 'montage.html:pairing' });
  const api = vm.runInContext(pick, sandbox);

  return Object.assign({}, api, {
    /* names in, sources out — each with videoName, pairWhy and pairWeak set
       exactly as the app would set them. */
    pair(scoutNames, videoNames){
      const sources = scoutNames.map(n => typeof n === 'string'
        ? { scoutName: n, videoFile: null, videoName: null, pairWhy: null, pairWeak: false }
        : n);
      const videos = videoNames.map(n => (typeof n === 'string' ? { name: n } : n));
      sandbox.S = { sources, videos };
      api.autoPair();
      return sources;
    },
  });
}

module.exports = { loadParser, loadPairing, APP };
