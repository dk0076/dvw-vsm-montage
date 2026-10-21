# dvw-vsm-montage

A single-file browser tool that turns coded volleyball match files into cut
video for coach review. Drop a scout file and its match video on the page,
filter down to the plays you want, and it exports an MP4 with title cards.

`montage.html` is the whole application. Open it in Chrome — there is nothing to
install and no server. Video never leaves the machine.

## Input

| Format | Written by | Touches | Ball coordinates | Video time |
|---|---|---|---|---|
| `.vsm` | VolleyStation | yes | yes | deciseconds |
| `.dvw` | VolleyMetrics Portal | yes | yes | whole seconds |
| `.dvw` | VolleyStation | yes | **no** | whole seconds |

Both formats carry absolute video timestamps, so there is no calibration step.
The anchor controls on the page exist to correct a file that is wrong, not to
line up a file that is right.

## Known limits

- **VolleyStation `.dvw` carries no ball coordinates.** Court-area filtering and
  the shot chart on title cards need geometry, so on those files they are empty.
  Export the same match as `.vsm` if you want them.
- **`.dvw` video time is whole seconds**, against deciseconds in `.vsm`, so clip
  in and out points are up to half a second coarser.
- **Rallies group coarsely on practice `.dvw`.** Rallies close on `*pNN:MM`
  score rows, and practice files rarely write them — one local file has 1086
  touches against 89 score rows, so a whole-rally clip there spans a drill
  rather than a rally. Match files are unaffected.
- **Duplicate jersey numbers pass without a warning.** A stacked roster (a new
  season appended on top of the old one instead of replacing it) silently merges
  two players in any player filter. `fixtures/vs-dup-jersey.dvw` is such a file.

## Tests

```bash
npm test
```

Fixtures are not in this repo; see [fixtures/README.md](fixtures/README.md).
Without them the suite skips.

The suite slices the `.dvw` parser straight out of `montage.html` by marker
text, so it exercises the code the coach actually runs rather than a second
copy that would drift. It pins the numbers a column shift would move — touches
parsed, touches dropped, rally grouping, rotation coverage, and which half of
the court attacks land in. Plausibility is not the bar: a parse that shifts by
one column still produces output that looks like volleyball.

`.vsm` parsing is not yet covered.

## History

The 24 commits before the tooling are the real version history, imported in
order from the `montage*.html` files that accumulated in `Downloads` between
21 and 24 August 2026, with author dates from each file's mtime. `.dvw` support
arrives at "Add .dvw support for DataVolley text files"; coordinates and the
code dictionary at "Add ball coordinates, court geometry and code-dictionary
mapping".
