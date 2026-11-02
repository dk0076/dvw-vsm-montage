'use strict';
/* Filename pairing, pinned against the two ways it used to get it wrong.

   Pairing a scout file to the wrong video is the quietest failure in this
   program. Every clip is then cut at a correct timestamp out of footage of a
   different session, the labels all read correctly, and nothing anywhere says
   otherwise — so these are regression tests before they are unit tests. The
   two cases that actually happened are marked below.

   Needs no fixtures: it runs on filenames. */

const { loadPairing } = require('../tools/extract-parser');

/* Optional path argument, so the same assertions can be pointed at a mutated
   copy of montage.html to confirm they still fail when the rules regress. */
const { pair, pairScore, pairDate } = loadPairing(process.argv[2]);

let checks = 0, failures = 0;

function eq(label, actual, expected){
  checks++;
  if (actual === expected) return;
  failures++;
  console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function ok(label, cond, detail){
  checks++;
  if (cond) return;
  failures++;
  console.log(`  FAIL ${label}${detail ? ': ' + detail : ''}`);
}

/* The pairing of one source, as "video | why | weak", for comparing in one go. */
const shape = M => `${M.videoName || '(none)'} | ${M.pairWhy || '-'} | ${M.pairWeak ? 'weak' : 'firm'}`;

/* ── the date rule, on its own ─────────────────────────────── */

console.log('\ndate extraction');
eq('ISO date', pairDate('&2025-11-16 643401 UNR-GCU(VM).dvw'), '20251116');
eq('no separators', pairDate('20251116 practice.mp4'), '20251116');
eq('underscores', pairDate('2025_11_16 practice.mp4'), '20251116');
eq('no date at all', pairDate('18 ucsb attacking.mp4'), null);
/* A bare match id must not read as a date, or every VolleyMetrics file would
   claim one and the disagreement rule would start rejecting good pairs. */
eq('match id is not a date', pairDate('643401.mp4'), null);
eq('impossible month rejected', pairDate('2025-13-16 x.mp4'), null);
eq('impossible day rejected', pairDate('2025-11-32 x.mp4'), null);

console.log('\nscoring');
ok('dates that disagree are refused outright',
   pairScore('2026-10-19 Cal-Cal.dvw', '2026-10-15 Cal-Cal.mp4') === null);
ok('a shared date beats team-name overlap',
   pairScore('2026-10-19 Cal-Cal.dvw', '2026-10-19 something else.mp4').score >
   pairScore('Cal-Cal practice.dvw', 'Cal-Cal drill reel.mp4').score);
ok('nothing in common is not a pair',
   pairScore('2026-10-19 Cal-Cal.dvw', 'holiday video.mp4') === null);

/* ── case 1: the VolleyMetrics convention ──────────────────── */

console.log('\nVolleyMetrics export, date and match id both agree');
{
  const [M] = pair(['&2025-11-16 643401 UNR-GCU(VM).dvw'],
                   ['&2025-11-16 643401 UNR-GCU(VM)-filter.mp4']);
  eq('paired', shape(M),
     '&2025-11-16 643401 UNR-GCU(VM)-filter.mp4 | date + match id | firm');
}

/* ── case 2: the practice-file trap that actually happened ─── */

console.log('\ntwo Cal-Cal practice files, one video (the greedy-order bug)');
{
  /* "2026-10-19 Cal-Cal.dvw" tokenises to [2026, 10, 19, cal]: both halves of
     Cal-Cal collapse into one token, so these two files agree on 3 of 4 tokens
     whatever the day. Counting tokens flat, in load order, 10-19 took the
     10-15 video at score 3 and the file it belonged to got nothing. */
  const got = pair(['2026-10-19 Cal-Cal.dvw', '2026-10-15 Cal-Cal.dvw'],
                   ['2026-10-15 Cal-Cal.mp4']);
  eq('the file whose date matches gets it', shape(got[1]),
     '2026-10-15 Cal-Cal.mp4 | date | firm');
  eq('the other is left for the coach', shape(got[0]), '(none) | - | firm');
}

console.log('\nsame files, opposite load order');
{
  /* The assignment must not depend on which file was dropped first. */
  const got = pair(['2026-10-15 Cal-Cal.dvw', '2026-10-19 Cal-Cal.dvw'],
                   ['2026-10-15 Cal-Cal.mp4']);
  eq('still the date that matches', shape(got[0]),
     '2026-10-15 Cal-Cal.mp4 | date | firm');
  eq('still the other left out', shape(got[1]), '(none) | - | firm');
}

/* ── case 3: the silent 1-and-1 fallback ───────────────────── */

console.log('\none match, one video, dates disagree (the silent-mispair bug)');
{
  /* The fallback used to pair these regardless, with no warning. */
  const [M] = pair(['2026-10-19 Cal-Cal.dvw'], ['2026-10-15 Cal-Cal.mp4']);
  eq('refused', shape(M), '(none) | - | firm');
}

console.log('\none match, one video, nothing in the names to go on');
{
  /* Still paired — it is almost always what was meant — but flagged, which is
     the whole difference from the old behaviour. */
  const [M] = pair(['2026-10-19 Cal-Cal.dvw'], ['18 ucsb attacking.mp4']);
  eq('paired as a guess', shape(M), '18 ucsb attacking.mp4 | only video loaded | weak');
}

console.log('\none match, one video, names agree but carry no date');
{
  /* What test/exe-smoke.js relies on: fixture stem and video stem match. */
  const [M] = pair(['vm-coords.dvw'], ['vm-coords.mp4']);
  eq('paired on the stem', shape(M), 'vm-coords.mp4 | name only | weak');
}

/* ── case 4: two matches on one day ───────────────────────── */

console.log('\ntwo matches the same day, separated by match id');
{
  const got = pair(['&2026-01-05 111111 AAA-BBB(VM).dvw', '&2026-01-05 222222 CCC-DDD(VM).dvw'],
                   ['&2026-01-05 222222 CCC-DDD(VM)-filter.mp4',
                    '&2026-01-05 111111 AAA-BBB(VM)-filter.mp4']);
  eq('first match', shape(got[0]),
     '&2026-01-05 111111 AAA-BBB(VM)-filter.mp4 | date + match id | firm');
  eq('second match', shape(got[1]),
     '&2026-01-05 222222 CCC-DDD(VM)-filter.mp4 | date + match id | firm');
}

/* ── housekeeping ─────────────────────────────────────────── */

console.log('\nleaves existing and absent pairings alone');
{
  const held = { name: '2026-10-15 Cal-Cal.mp4' };
  const got = pair([
    { scoutName: '2026-10-15 Cal-Cal.dvw', videoFile: held, videoName: held.name,
      pairWhy: 'you chose it', pairWeak: false },
    '2026-10-19 Cal-Cal.dvw',
  ], [held]);
  eq('a hand-made pairing is not revisited', shape(got[0]),
     '2026-10-15 Cal-Cal.mp4 | you chose it | firm');
  eq('and its video is not stolen', shape(got[1]), '(none) | - | firm');

  const none = pair(['2026-10-19 Cal-Cal.dvw'], []);
  eq('no videos loaded', shape(none[0]), '(none) | - | firm');

  /* Two matches, two videos, every name identical apart from the date: the
     cross pairs are refused by date, so each gets its own. */
  const both = pair(['2026-10-15 Cal-Cal.dvw', '2026-10-19 Cal-Cal.dvw'],
                    ['2026-10-19 Cal-Cal.mp4', '2026-10-15 Cal-Cal.mp4']);
  eq('both paired by date', `${shape(both[0])} / ${shape(both[1])}`,
     '2026-10-15 Cal-Cal.mp4 | date | firm / 2026-10-19 Cal-Cal.mp4 | date | firm');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
