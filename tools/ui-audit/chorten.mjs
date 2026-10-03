// Scan summit-chorten placements and report where each one lands on screen, and how much of
// it the parked camera can actually see.
//
// The summit chorten's size is a composition constraint, not a ratio: it has to read as the
// destination of the climb while standing clear of the summit rail and its glass panel.
// This projects candidate (right, ahead, height) triples at the parked camera pose so the
// choice is made on screen rectangles instead of by eye.
//
// It also ray-casts from the camera up the chorten's axis against the rendered terrain.
// The first version only projected the box, and a chorten standing 34m out behind the
// summit crest passed every rule while the snow in front hid everything below its dome.
//
//   node tools/ui-audit/chorten.mjs --viewports 1440,1024,1920
//
// Candidates are written in the parked camera's frame (t = 1), as CHORTEN_MAIN is.

import { launch, sleep } from './cdp.mjs'
import { parseArgs, urlFor, viewportsFrom } from './args.mjs'

const opts = parseArgs()

const PROBE = `
  const h = window.__hero;
  h.rig.lenis.scrollTo(h.heroLayout.track + 40, { immediate: true, force: true });
  await new Promise((r) => setTimeout(r, 1500));

  const A = await import('/src/scene/nepal/anchors.ts');
  const T = await import('/src/scene/terrain.ts');
  const L = await import('/src/summit/layout.ts');
  const G = await import('/src/scene/nepal/chortenGeometry.ts');
  const camera = h.debugHandles.camera;
  if (!camera) return { error: 'no camera handle' };
  const V = camera.position.constructor;

  const project = (x, y, z) => {
    const v = new V(x, y, z).project(camera);
    return { x: v.x * 0.5 + 0.5, y: -v.y * 0.5 + 0.5, z: v.z };
  };
  const seen = (p) => {
    const c = camera.position;
    for (let i = 1; i < 120; i++) {
      const u = i / 120;
      if (T.surfaceHeightAt(c.x + (p.x - c.x) * u, c.z + (p.z - c.z) * u) > c.y + (p.y - c.y) * u + 0.03) return false;
    }
    return true;
  };
  const overlaps = (b, z) => b.x1 > z.x0 && b.x0 < z.x1 && b.y1 > z.y0 && b.y0 < z.y1;

  const out = [];
  for (let right = -4; right <= 12; right += 0.5) {
    for (let ahead = 10; ahead <= 40; ahead += 1) {
      for (const height of [3.2, 3.6, 4, 4.5, 5.14, 6]) {
        const s = height / 7.35;
        const at = A.anchorAtT(1, { right, ahead }, true);
        // Seated as plan.ts seats it: the whitewash steps clear the highest ground under them.
        const base = A.groundTop(at.x, at.z, G.CHORTEN_STEP_HALF * Math.SQRT2 * s) - (G.CHORTEN_STONE_TOP - 0.15) * s;
        let hidden = 1;
        for (let k = 0; k <= 40; k++) {
          if (seen(new V(at.x, base + (height * k) / 40, at.z))) { hidden = k / 40; break; }
        }
        const half = 2.7 * s;
        const pts = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const yy of [base, base + height]) {
          pts.push(project(at.x + sx * half, yy, at.z + sz * half));
        }
        if (pts.some((p) => p.z > 1)) continue;
        const b = {
          x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
          y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)),
        };
        const why = [];
        // Clear of the rail and an open panel, so the chorten is never seen through the glass.
        if (overlaps(b, L.PANEL_ZONE)) why.push('PANEL');
        if (b.x0 < 0.01 || b.x1 > 0.99 || b.y1 > 1) why.push('off');
        if (hidden > 0.1) why.push('hidden');
        const visible = (b.y1 - b.y0) * (1 - hidden);
        out.push({
          why, right, ahead, height, hiddenPct: Math.round(hidden * 100),
          pct: [b.x0, b.y0, b.x1, b.y1].map((v) => Math.round(v * 100)),
          visiblePct: +(visible * 100).toFixed(1),
        });
      }
    }
  }
  const clean = out.filter((o) => o.why.length === 0).sort((a, b) => b.visiblePct - a.visiblePct);
  const tally = {};
  for (const o of out) for (const w of o.why) tally[w] = (tally[w] || 0) + 1;
  return { total: out.length, count: clean.length, tally, top: clean.slice(0, 15) };
`

for (const [i, vp] of viewportsFrom(opts.viewports).entries()) {
  const { session, close } = await launch({ port: 9650 + i, width: vp.w, height: vp.h })
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: !!vp.mobile,
      screenWidth: vp.w, screenHeight: vp.h,
    })
    await session.send('Page.navigate', { url: urlFor(opts, vp) })
    await session.once('Page.loadEventFired')
    await sleep(5000)
    const r = await session.eval(PROBE)
    console.log(`\n=== ${vp.w}x${vp.h} === ${r.count} of ${r.total} fit; blockers ${JSON.stringify(r.tally)}`)
    for (const o of r.top ?? []) {
      console.log(
        `  right ${String(o.right).padStart(5)}  ahead ${String(o.ahead).padStart(3)}  h ${o.height}m  ` +
          `screen ${o.pct[0]}-${o.pct[2]}% x ${o.pct[1]}-${o.pct[3]}%  hidden ${o.hiddenPct}%  visible ${o.visiblePct}% of the frame`,
      )
    }
  } finally {
    close()
  }
}
