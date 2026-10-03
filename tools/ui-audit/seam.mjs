// Which object is responsible for something visible?
//
// Hides each top-level scene object in turn, re-renders, and reports how much of the step
// at the seam row survives. Whatever removal flattens the step is the thing drawing it, so
// a defect can be attributed instead of guessed at.
//
//   node tools/ui-audit/seam.mjs --viewports 1132

import { launch, sleep } from './cdp.mjs'
import { parseArgs, urlFor, viewportsFrom } from './args.mjs'

const opts = parseArgs()
/** Scroll offset with the seam clearly in frame, and the column to read (clean sky). */
const AT = Number(opts.at ?? 4800)
const COLUMN = Number(opts.column ?? 60)

const WINDOW = [Number(opts.from ?? 150), Number(opts.to ?? 240)]

const PROBE = `
  const h = window.__hero;
  const root = document.getElementById('scroll-root');
  const gl = h.debugHandles.gl;
  const scene = h.debugHandles.scene;
  const camera = h.debugHandles.camera;
  if (!gl || !scene || !camera) return { error: 'no scene handles' };

  root.scrollTo({ top: ${AT}, behavior: 'instant' });
  await new Promise((r) => setTimeout(r, 1400));

  const canvas = gl.domElement;
  const dpr = gl.getPixelRatio();
  const readColumn = () => {
    gl.render(scene, camera);
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    const ctx = c.getContext('2d');
    const x = Math.round(${COLUMN} * dpr);
    const d = ctx.getImageData(x, 0, 1, c.height).data;
    const col = [];
    for (let y = 0; y < c.height; y++) col.push([d[y*4], d[y*4+1], d[y*4+2]]);
    return col;
  };

  // Find the strongest vertical step in the upper sky, and how big it is.
  const stepOf = (col) => {
    let best = { y: -1, d: 0 };
    const lo = Math.round(${WINDOW[0]} * dpr), hi = Math.round(${WINDOW[1]} * dpr);
    for (let y = lo; y < hi; y++) {
      const a = col[y - 1], b = col[y];
      if (!a || !b) continue;
      const d = Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1]), Math.abs(a[2]-b[2]));
      if (d > best.d) best = { y: Math.round(y / dpr), d };
    }
    return best;
  };

  const base = stepOf(readColumn());
  const rows = [];
  const kids = scene.children.filter((o) => o.visible);
  for (const obj of kids) {
    obj.visible = false;
    const s = stepOf(readColumn());
    obj.visible = true;
    const mat = obj.material;
    const geo = obj.geometry;
    rows.push({
      name: obj.name || [obj.type, geo && geo.type, mat && mat.type].filter(Boolean).join('/'),
      kind: obj.type,
      order: obj.renderOrder,
      transparent: !!(mat && mat.transparent),
      children: obj.children.length,
      stepY: s.y,
      step: s.d,
      removed: base.d - s.d,
    });
  }
  rows.sort((a, b) => b.removed - a.removed);
  return { baseStep: base, at: ${AT}, column: ${COLUMN}, rows };
`

for (const [i, vp] of viewportsFrom(opts.viewports).entries()) {
  const { session, close } = await launch({ port: 9780 + i, width: vp.w, height: vp.h })
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: !!vp.mobile,
      screenWidth: vp.w, screenHeight: vp.h,
    })
    await session.send('Page.navigate', { url: urlFor(opts, vp) })
    await session.once('Page.loadEventFired')
    await sleep(3000)
    for (let k = 0; k < 160; k++) {
      if (await session.eval(`return !!(window.__hero && window.__hero.debugHandles && window.__hero.debugHandles.scene)`)) break
      await sleep(250)
    }
    const r = await session.eval(PROBE)
    if (r.error) { console.log(r.error); continue }
    console.log(`\n=== ${vp.w}x${vp.h} @${r.at}, column x=${r.column} ===`)
    console.log(`baseline step: ${r.baseStep.d} levels at y=${r.baseStep.y}`)
    for (const row of r.rows) {
      console.log(
        `  hide ${String(row.name).padEnd(46)} order ${String(row.order).padStart(3)} ${row.transparent ? 'T' : ' '} step -> ${String(row.step).padStart(3)} at y=${String(row.stepY).padStart(3)}  (removed ${row.removed})`,
      )
    }
  } finally {
    close()
  }
}
