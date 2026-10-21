'use strict';
/* Smoke test for the PACKAGED build, driven over the Chrome DevTools Protocol.

   test/smoke.js slices the parser out of montage.html and runs it in Node, so
   it says nothing about whether the shipped .exe works: the asar could be
   missing the HTML, the window could fail to open, WebCodecs could be absent
   from the packaged runtime. This one launches the real binary and pushes the
   same fixtures through its own renderer.

   CDP is the only way in. A packaged renderer has no preload and no Node, so it
   cannot read a fixture off disk by itself, and there is no way to synthesise a
   drag-and-drop from outside the window. So the fixture text and the stub video
   go in as part of the evaluated expression.

   Needs a build first (npm run dist) and the fixtures present; skips cleanly
   without either. Baseline is test/expected.json, the same file test/smoke.js
   asserts against — there is deliberately no second baseline to drift. */

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'fixtures');
const EXPECTED = path.join(__dirname, 'expected.json');
const STUB_VIDEO = path.join(__dirname, 'assets', 'stub-video.mp4');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── locating the build ──────────────────────────────────────
   win-unpacked is preferred: it is a direct launch, where the portable
   artifact self-extracts and runs a second process. Both are killed by walking
   the process tree, so either works, but the direct one starts faster. */
function findExe(){
  const unpacked = path.join(ROOT, 'dist', 'win-unpacked', 'montage.exe');
  if (fs.existsSync(unpacked)) return unpacked;

  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(dist)) return null;
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const portable = fs.readdirSync(dist)
    .filter(f => f.toLowerCase().endsWith('.exe') && f.includes(version) && !/setup/i.test(f))
    .map(f => path.join(dist, f));
  return portable[0] || null;
}

/* ── CDP over Node's built-in WebSocket ──────────────────────
   Node 22+ ships a WebSocket client, so this needs no dependency. */
function connect(url){
  const ws = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  let closed = null;

  const ready = new Promise((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error('devtools websocket failed to open'));
  });
  ws.onclose = () => {
    closed = new Error('devtools websocket closed');
    for (const reject of pending.values()) reject.rej(closed);
    pending.clear();
  };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)){ pending.get(m.id).res(m); pending.delete(m.id); }
  };

  const send = (method, params) => new Promise((res, rej) => {
    if (closed) return rej(closed);
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
      allowUnsafeEvalBlockedByCSP: true,
    });
    if (r.error) throw new Error(r.error.message || JSON.stringify(r.error));
    const d = r.result;
    if (d.exceptionDetails){
      const ex = d.exceptionDetails;
      throw new Error(ex.exception?.description || ex.text || 'evaluation threw');
    }
    return d.result.value;
  };

  return { ready, send, evaluate, close: () => { try { ws.close(); } catch {} } };
}

async function findPageTarget(port, timeoutMs){
  const deadline = Date.now() + timeoutMs;
  let lastErr = 'no response';
  while (Date.now() < deadline){
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      const page = list.find(t => t.type === 'page' && /montage\.html$/i.test(t.url || ''));
      if (page?.webSocketDebuggerUrl) return page;
      lastErr = `targets: ${list.map(t => t.type).join(',') || 'none'}`;
    } catch (e){ lastErr = e.message; }
    await sleep(400);
  }
  throw new Error(`no montage.html page target on port ${port} after ${timeoutMs}ms (${lastErr})`);
}

/* Kill the whole tree. The portable artifact's real app process is a child of
   the launcher, and Electron keeps GPU and renderer children of its own, so
   killing just the pid we spawned leaves windows behind. */
function killTree(pid){
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } catch { /* already gone */ }
}

/* ── assertions ───────────────────────────────────────────── */

let checks = 0, failures = 0;

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

/* ── main ─────────────────────────────────────────────────── */

async function main(){
  if (process.platform !== 'win32'){
    console.log(`SKIP  packaged build is Windows-only (platform is ${process.platform}).`);
    return 0;
  }

  const expected = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'));
  const present = expected.filter(e => fs.existsSync(path.join(FIXTURES, e.file)));
  if (!present.length){
    console.log('SKIP  no fixtures present. See fixtures/README.md for what to drop in.');
    return 0;
  }

  const exe = findExe();
  if (!exe){
    console.log('SKIP  no build found in dist/. Run `npm run dist` first.');
    return 0;
  }
  if (!fs.existsSync(STUB_VIDEO)){
    console.log(`SKIP  ${path.relative(ROOT, STUB_VIDEO)} is missing.`);
    return 0;
  }

  /* A build older than the source is the one way this suite can mislead: it
     would pass against an exe that does not contain the change under test and
     report the shipped binary as good. That is worse than not running, so it
     fails rather than skipping. */
  const appSrc = path.join(ROOT, 'montage.html');
  if (fs.statSync(appSrc).mtimeMs > fs.statSync(exe).mtimeMs + 1000){
    console.log('FAIL  montage.html is newer than the build in dist/.');
    console.log('      The exe does not contain your change. Run `npm run dist` first.');
    return 1;
  }

  console.log(`driving ${path.relative(ROOT, exe)}`);

  const port = 30000 + Math.floor(Math.random() * 20000);
  const child = spawn(exe, [`--remote-debugging-port=${port}`], {
    stdio: 'ignore', windowsHide: true,
  });
  child.on('error', e => { console.log(`  FAIL could not launch: ${e.message}`); failures++; });

  const cleanup = () => killTree(child.pid);
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  let cdp;
  try {
    const page = await findPageTarget(port, 40000);
    cdp = connect(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');

    /* montage.html is one long classic script. The page target appears as soon
       as the document exists, which can be before `const S` is initialised, so
       probing once reports a false negative. Wait for the app instead. */
    const readyDeadline = Date.now() + 30000;
    let appReady = false;
    while (Date.now() < readyDeadline){
      appReady = await cdp.evaluate(
        `typeof S === 'object' && S !== null && Array.isArray(S.sources) && typeof load === 'function'`);
      if (appReady) break;
      await sleep(250);
    }
    ok('app initialised in the packaged window', appReady,
       'S and load() never appeared within 30s');
    if (!appReady) return 1;

    const win = await cdp.evaluate(`({
      title: document.title,
      url: location.href,
      sections: document.querySelectorAll('section').length,
      hasVideoEncoder: typeof VideoEncoder === 'function',
      hasVideoDecoder: typeof VideoDecoder === 'function',
    })`);
    console.log(`\npackaged window — ${win.title}`);
    console.log(`  ${win.url}`);
    ok('window has a title', !!win.title && win.title.trim().length > 0);
    ok('window rendered its sections', win.sections > 0, `sections=${win.sections}`);
    /* The export path needs these, and a packaged runtime is where they would
       plausibly go missing. */
    ok('VideoEncoder present in the packaged runtime', win.hasVideoEncoder);
    ok('VideoDecoder present in the packaged runtime', win.hasVideoDecoder);

    /* One copy of the stub video for every fixture. */
    const videoB64 = fs.readFileSync(STUB_VIDEO).toString('base64');
    await cdp.evaluate(
      `window.__stubVideo = Uint8Array.from(atob(${JSON.stringify(videoB64)}), c => c.charCodeAt(0)), 'ok'`);

    for (const e of expected){
      const file = path.join(FIXTURES, e.file);
      if (!fs.existsSync(file)){
        console.log(`\nSKIP  ${e.file} (not present)`);
        continue;
      }
      console.log(`\n${e.file}  — ${e.note}`);
      const text = fs.readFileSync(file, 'latin1').replace(/^﻿/, '');
      const stem = e.file.replace(/\.dvw$/i, '');

      const r = await cdp.evaluate(`(async () => {
        const alerts = [];
        const realAlert = window.alert;
        window.alert = m => alerts.push(String(m));   // never block on a dialog
        try {
          S.sources.length = 0; S.videos.length = 0; S.plays.length = 0; S.filt = {};
          const scout = new File([${JSON.stringify(text)}], ${JSON.stringify(e.file)},
                                 { type: 'text/plain' });
          /* Same filename stem, so autoPair matches them. rebuild() drops every
             play from an unpaired source, so without this S.plays stays empty. */
          const video = new File([window.__stubVideo], ${JSON.stringify(stem)} + '.mp4',
                                 { type: 'video/mp4' });
          await load([scout, video]);

          const M = S.sources[0];
          /* matched() returns [] while no facet is selected, so an empty filter
             can never produce clips. Select kills to exercise the clip model. */
          S.filt = { skill: new Set(['A']), effect: new Set(['#']) };
          buildClips();

          return {
            loaded: !!M,
            videoPaired: !!(M && M.videoFile),
            teams: M ? Object.values(M.teams).join(' v ') : null,
            plays: S.plays.length,
            rallies: S.rallies.length,
            sets: [...new Set(S.plays.map(p => p.set))].sort((a, b) => a - b).join(','),
            coords: S.plays.filter(p => p.path && p.path.length).length,
            rosters: M ? M.rosters['*'].length + '/' + M.rosters.a.length : null,
            clips: {
              count: S.clips.length,
              badWindow: S.clips.filter(c =>
                !Number.isFinite(c.s) || !Number.isFinite(c.e) || c.s < 0 || c.e <= c.s).length,
              unlabelled: S.clips.filter(c => !c.label || !String(c.label).trim()).length,
              sample: S.clips[0] ? S.clips[0].label : null,
            },
            alerts,
          };
        } catch (err) {
          return { threw: String((err && err.message) || err), alerts };
        } finally { window.alert = realAlert; }
      })()`);

      if (r.threw){
        checks++; failures++;
        console.log(`  FAIL load() threw: ${r.threw}`);
        continue;
      }
      ok('no alert dialogs', r.alerts.length === 0, r.alerts.join(' | '));
      ok('source loaded', r.loaded);
      ok('stub video paired by filename stem', r.videoPaired);

      eq('plays', r.plays, e.plays);
      eq('rallies', r.rallies, e.rallies);
      eq('sets', r.sets, e.sets);
      eq('plays with coordinates', r.coords, e.coords);
      eq('roster sizes', r.rosters, e.rosters);

      /* Clip counts are not in expected.json on purpose: tools/rebaseline.js
         runs in Node with no DOM, so it could never regenerate them. Assert the
         invariants instead and print the count so a human sees drift. */
      const c = r.clips;
      console.log(`  ${r.teams} · ${c.count} kill clips · e.g. ${c.sample || '(none)'}`);
      ok('kill clips built', c.count > 0, `count=${c.count}`);
      eq('clips with a bad window', c.badWindow, 0);
      eq('clips with no label', c.unlabelled, 0);
    }
  } finally {
    cdp?.close();
    cleanup();
    process.off('exit', cleanup);
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  return failures ? 1 : 0;
}

main().then(
  code => process.exit(code),
  err => { console.error(`\nFAILED: ${err.message}`); process.exit(1); },
);
