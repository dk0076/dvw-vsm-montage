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

function loadParser(file = APP){
  const src = fs.readFileSync(file, 'latin1');
  const code = [
    slice(src, 'const COURT = {', 'const lane ='),      // COURT, dvwPoint, orientDvw
    slice(src, "const DVW_SKILLS =", 'function parseVsm'), // dvwSection, dvwCode, parseDvw
  ].join('\n');

  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;({ COURT, dvwPoint, orientDvw, dvwSection, dvwCode, parseDvw });',
                  sandbox, { filename: 'montage.html:dvw' });
  return vm.runInContext('({ COURT, dvwPoint, orientDvw, dvwSection, dvwCode, parseDvw })', sandbox);
}

module.exports = { loadParser, APP };
