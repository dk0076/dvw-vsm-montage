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

module.exports = { loadParser, APP };
