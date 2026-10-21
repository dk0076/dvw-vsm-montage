# Fixtures

Scout files are **not** committed. They carry opponent scouting and
VolleyMetrics-licensed data, and this remote is public. `.gitignore` excludes
everything in this directory except this file.

`test/smoke.js` pins its numbers to four files. Drop them in under these names
and `npm test` will check them; leave them out and it skips.

| Name | What it has to be |
|---|---|
| `vm-coords.dvw` | A VolleyMetrics Portal export with ball coordinates on every touch |
| `vs-match.dvw` | A VolleyStation match export: scored rallies, no coordinates |
| `vs-practice.dvw` | A VolleyStation practice export: touches coded, points rarely scored |
| `vs-dup-jersey.dvw` | A VolleyStation export whose home roster is stacked (duplicate jerseys) |

The expected counts live in `test/expected.json`. They were generated from one
specific file per slot, so swapping in a different match means regenerating that
baseline — and reading it before you trust it, because the baseline is the only
thing standing between a one-column parser shift and a season of plausible,
wrong numbers.

To regenerate after deliberately changing a fixture:

```bash
node tools/rebaseline.js
```
