# dvw-vsm-montage

A single-file browser tool that turns coded volleyball match files into cut
video for coach review. Drop a scout file and its match video on the page,
filter down to the plays you want, and it exports an MP4 with title cards.

`montage.html` is the whole application. Open it in Chrome — there is nothing to
install and no server. Video never leaves the machine.

## Input

| Format | Written by | Touches | Continuous xy | Zone / subzone | Video time |
|---|---|---|---|---|---|
| `.vsm` | VolleyStation | yes | yes | — | deciseconds |
| `.dvw` | VolleyMetrics Portal | yes | yes (99%) | yes (99%) | whole seconds |
| `.dvw` | VolleyStation | yes | no | yes (20–39%) | whole seconds |

`.dvw` carries position two ways. The continuous 1–10000 grid index sits in the
start/mid/end columns, and zone, end zone and end subzone sit inside the play
code itself at characters 10, 11 and 12 — `a09AQ#PG~42~H2` is start zone 4, end
zone 2. VolleyStation writes the second but not the first; VolleyMetrics writes
both. Coverage percentages above are over touches in the local file set, and
depend on how much the coder entered.

Both formats carry absolute video timestamps, so there is no calibration step.
The anchor controls on the page exist to correct a file that is wrong, not to
line up a file that is right.

## Known limits

- **`dvwCode` throws away the zone data.** It reads the play code up to the
  combination at characters 7–8 and discards the rest, so setter call, start
  zone, end zone and end subzone never reach a play object. Court-area filtering
  and the shot chart fall back to nothing on VolleyStation `.dvw` even though the
  file states where the ball went, and on VolleyMetrics `.dvw` they use only the
  grid index while 99% zone coverage sits unread. `scoutR/R/parse_dvw.R` reads
  these fields correctly and is the reference for what the characters mean.
- **`.dvw` video time is whole seconds**, against deciseconds in `.vsm`, so clip
  in and out points are up to half a second coarser.
- **Rallies group coarsely on practice `.dvw`.** Rallies close on `*pNN:MM`
  score rows, and practice files rarely write them — one local file has 1086
  touches against 89 score rows, so a whole-rally clip there spans a drill
  rather than a rally. Match files are unaffected.
- **Duplicate jersey numbers pass without a warning.** A stacked roster (a new
  season appended on top of the old one instead of replacing it) silently merges
  two players in any player filter. `fixtures/vs-dup-jersey.dvw` is such a file.

## Desktop build

An `.exe` is for this machine, not for the coaches — the whole point of the
plain HTML file is that it needs no install. `desktop/main.js` is a thin
Electron window that loads `montage.html` off disk rather than copying it, so
Ctrl+R picks up an edit and the file stays byte-identical to the one that works
double-clicked in Chrome.

```bash
npm install     # pulls Electron, about 300 MB into node_modules
npm run app     # run it as a desktop window
npm run dist    # build dist/montage Setup <version>.exe and a portable .exe
```

Ctrl+R reloads and Ctrl+Shift+I opens devtools; both come from Electron's
default menu.

`build.win.signAndEditExecutable` is `false` deliberately. With it on,
electron-builder fetches its `winCodeSign` bundle and extracts it with 7-Zip,
and that archive contains macOS `.dylib` symlinks — so on a Windows account
without the create-symbolic-link privilege the extraction fails with
`A required privilege is not held by the client`, retries four times and
produces no artifacts. Turning it off skips the fetch, because nothing here is
signed anyway: there is no certificate.

The cost is that `rcedit` never runs, so the `.exe` carries Electron's default
icon and no version metadata. To get those back, turn on Windows Developer Mode
(Settings › System › For developers) or build from an elevated shell, then set
the flag to `true`.

The `build.files` whitelist in `package.json` lists only `montage.html`,
`desktop/main.js` and `package.json`. Keep it that way — a glob would pull
`fixtures/` into the installer and ship opponent scouting inside the `.exe`.

If you only want it to *feel* like an app and don't care about an installer, a
Chrome shortcut gets you a windowed, chrome-less version with its own taskbar
icon for nothing:

```
chrome.exe --app="file:///C:/Users/drewk/code/dvw-vsm-montage/montage.html"
```

## Tests

```bash
npm test         # the parser, in Node
npm run test:exe # the packaged build, over the DevTools protocol
```

Fixtures are not in this repo; see [fixtures/README.md](fixtures/README.md).
Without them both suites skip.

The suite slices the `.dvw` parser straight out of `montage.html` by marker
text, so it exercises the code the coach actually runs rather than a second
copy that would drift. It pins the numbers a column shift would move — touches
parsed, touches dropped, rally grouping, rotation coverage, and which half of
the court attacks land in. Plausibility is not the bar: a parse that shifts by
one column still produces output that looks like volleyball.

`npm test` says nothing about the shipped `.exe` — the asar could be missing the
HTML, the window could fail to open, WebCodecs could be absent from the packaged
runtime, and the parser would still pass. `npm run test:exe` covers that: it
needs a build (`npm run dist`) and skips with a note if there isn't one, then
launches the real binary with `--remote-debugging-port` and pushes the same
fixtures through its own renderer.

It goes in over CDP because there is no other way in. A packaged renderer has no
preload and no Node, so it cannot read a fixture off disk by itself, and a
drag-and-drop cannot be synthesised from outside the window — so the fixture
text and the stub video are passed in as part of the evaluated expression.
`test/assets/stub-video.mp4` is a 4 KB placeholder that exists only because
`rebuild()` drops every play from a source with no video paired; it is given the
fixture's filename stem so `autoPair` matches it.

It fails rather than skips when `montage.html` is newer than the build, because
a pass against a stale exe would report the shipped binary as good while not
containing the change under test. Rebuild before running it.

Both suites share `test/expected.json`. The `.exe` suite adds the invariants
that baseline cannot hold — clip count above zero, no NaN or inverted windows,
every clip labelled — because `tools/rebaseline.js` runs in Node with no DOM and
could never regenerate a clip count.

`.vsm` parsing is not yet covered.

## History

The 24 commits before the tooling are the real version history, imported in
order from the `montage*.html` files that accumulated in `Downloads` between
21 and 24 August 2026, with author dates from each file's mtime. `.dvw` support
arrives at "Add .dvw support for DataVolley text files"; coordinates and the
code dictionary at "Add ball coordinates, court geometry and code-dictionary
mapping".
