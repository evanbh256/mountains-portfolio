// Performance baseline: GPU time per frame at three poses, plus frame times across a
// scripted scroll of the whole page.
//
//   node tools/ui-audit/perf.mjs --out docs/ui-audit/before/perf.json --dpr 1.5
//
// Two numbers, measured differently on purpose:
//
//   throughput  Chrome launched with vsync off, so rAF runs as fast as the scene can be
//               drawn. This is the headroom number: it responds to pixel count and
//               geometry, and it is what gates a phase.
//   scroll      A scripted scroll at normal vsync. Frame time here is capped at 16.7ms, so
//               read it only as a dropped-frame count (over33).
//
// EXT_disjoint_timer_query_webgl2 is deliberately NOT used: on this machine's ANGLE/D3D11
// backend it reports about 6.5ms at DPR 1, 2 and 3 alike, so it measures query overhead
// rather than the scene.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { parseArgs, urlFor, viewportsFrom } from './args.mjs'

const opts = parseArgs()
const OUT = opts.out.endsWith('.json') ? opts.out : `${opts.out}/perf.json`

/**
 * Poses worth measuring: dense valley, the cloud break, and the parked summit, as fractions
 * of the page's scroll. The page is the climb and nothing else, so these are climb progress.
 * (They were 0.02, 0.35 and 0.72 while six more screens of summit scroll followed the climb;
 * these are the same three camera poses, so numbers stay comparable with older baselines.)
 */
const POSES = [
  ['valley', 0.033],
  ['cloudbreak', 0.583],
  ['summit', 1],
]

/**
 * Frames per second at the current pose with vsync off: how fast the scene can actually be
 * drawn. Unlike the timer extension (which several drivers emulate and report nothing
 * useful for) this responds to pixel count and geometry, so it is the number that gates a
 * phase. Discards the first samples while the clocks spin up.
 */
const THROUGHPUT = `
  const renderer = window.__hero.debugHandles.gl;
  const gl = renderer && renderer.getContext ? renderer.getContext() : null;
  if (!gl) return { supported: false, reason: 'no renderer handle' };
  // WebGL commands are queued, so without a sync the rAF loop races ahead of the GPU and
  // measures the JS loop instead of the draw. Reading one pixel forces the queue to drain,
  // which makes each iteration cost what the frame actually costs.
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const deltas = [];
  let last = performance.now();
  await new Promise((resolve) => {
    const step = () => {
      sync();
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      if (deltas.length >= 220) return resolve();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const s = deltas.slice(40).sort((a, b) => a - b);
  return {
    supported: true,
    frames: s.length,
    minMs: +s[0].toFixed(3),
    medianMs: +s[Math.floor(s.length / 2)].toFixed(3),
    p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(3),
    fps: +(1000 / s[Math.floor(s.length / 2)]).toFixed(1),
  };
`

const SCROLL_RUN = (seconds) => `
  const root = document.getElementById('scroll-root');
  const max = root.scrollHeight - root.clientHeight;
  const h = window.__hero;
  const deltas = [];
  const samples = [];
  const t0 = performance.now();
  let last = t0;
  await new Promise((resolve) => {
    const step = (now) => {
      deltas.push(now - last);
      last = now;
      const u = (now - t0) / ${seconds * 1000};
      if (u >= 1) return resolve();
      root.scrollTo({ top: u * max, behavior: 'instant' });
      if (deltas.length % 20 === 0) {
        samples.push({ y: Math.round(u * max), t: +h.scrollStore.t.toFixed(3), tris: h.sceneStats.triangles, calls: h.sceneStats.calls });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const s = deltas.slice(5).sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    frames: s.length,
    medianMs: +q(0.5).toFixed(2),
    p95Ms: +q(0.95).toFixed(2),
    p99Ms: +q(0.99).toFixed(2),
    worstMs: +s[s.length - 1].toFixed(2),
    over16: s.filter((d) => d > 16.7).length,
    over33: s.filter((d) => d > 33.4).length,
    peakTris: Math.max(...samples.map((x) => x.tris)),
    peakCalls: Math.max(...samples.map((x) => x.calls)),
    samples,
  };
`

const out = { url: opts.url, dpr: opts.dpr, at: new Date().toISOString(), runs: [] }

for (const [i, vp] of viewportsFrom(opts.viewports).entries()) {
  const { session, close } = await launch({ port: 9400 + i, width: vp.w, height: vp.h, unthrottled: true })
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: opts.dpr,
      mobile: !!vp.mobile,
      screenWidth: vp.w,
      screenHeight: vp.h,
    })
    if (vp.mobile) await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await session.send('Page.navigate', { url: urlFor(opts, vp) })
    await session.once('Page.loadEventFired')
    await sleep(3000)
    for (let k = 0; k < 160; k++) {
      if (await session.eval(`return !!(window.__hero && window.__hero.sceneStats.triangles > 0)`)) break
      await sleep(250)
    }

    const meta = await session.eval(`
      const probe = document.createElement('canvas').getContext('webgl2');
      const dbg = probe && probe.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: dbg ? probe.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a',
        sceneDpr: window.__hero.sceneStats.dpr,
        devicePixelRatio,
        maxScroll: (() => { const r = document.getElementById('scroll-root'); return r.scrollHeight - r.clientHeight })(),
      };
    `)

    const poses = {}
    for (const [name, frac] of POSES) {
      await session.eval(`
        const r = document.getElementById('scroll-root');
        r.scrollTo({ top: ${frac} * (r.scrollHeight - r.clientHeight), behavior: 'instant' });
        return true;
      `)
      await sleep(2000)
      poses[name] = { throughput: await session.eval(THROUGHPUT) }
      poses[name].stats = await session.eval(
        `return { tris: window.__hero.sceneStats.triangles, calls: window.__hero.sceneStats.calls, t: +window.__hero.scrollStore.t.toFixed(3) }`,
      )
    }

    await session.eval(`document.getElementById('scroll-root').scrollTo({ top: 0, behavior: 'instant' }); return true`)
    await sleep(1500)
    const scroll = await session.eval(SCROLL_RUN(14))

    out.runs.push({ ...vp, meta, poses, scroll })
    const g = Object.entries(poses)
      .map(([k, v]) => `${k} ${v.throughput.medianMs}ms/${v.throughput.fps}fps`)
      .join('  ')
    console.log(`${vp.w}x${vp.h} @dpr${opts.dpr}  throughput: ${g}  |  dropped>33ms: ${scroll.over33}/${scroll.frames}`)
  } finally {
    close()
  }
  await sleep(500)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(out, null, 2))
console.log('wrote', OUT)
