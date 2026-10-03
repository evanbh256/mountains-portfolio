// Interleaved A/B of one render-state change, at one pose, in one page session.
//
// Absolute timings on this machine drift by 10-20% between runs, which is more than most
// single changes cost - so "slower than the last phase" can never settle whether a change
// was expensive. Alternating the two states inside one session, many times, cancels the
// drift: both states see the same clocks, the same thermal state and the same neighbours.
//
// Currently wired to the light-shafts pass (renderOrder 30) and its depth test. Point it at
// something else by changing what PROBE toggles.
//
//   node tools/ui-audit/ab.mjs --viewports 1440

import { launch, sleep } from './cdp.mjs'
import { parseArgs, urlFor, viewportsFrom } from './args.mjs'
const opts = parseArgs()
const PROBE = `
  const h = window.__hero, root = document.getElementById('scroll-root');
  const gl = h.debugHandles.gl, scene = h.debugHandles.scene, camera = h.debugHandles.camera;
  root.scrollTo({ top: 0.583 * (root.scrollHeight - root.clientHeight), behavior: 'instant' });
  await new Promise((r) => setTimeout(r, 1800));
  let shafts = null;
  scene.traverse((o) => { if (o.renderOrder === 30 && o.material) shafts = o; });
  if (!shafts) return { error: 'no shafts mesh found (window may be closed at this t)' };
  const px = new Uint8Array(4);
  const ctx = gl.getContext();
  const measure = () => {
    const d = [];
    let last = performance.now();
    for (let i = 0; i < 90; i++) {
      gl.render(scene, camera);
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      const now = performance.now(); d.push(now - last); last = now;
    }
    d.sort((a, b) => a - b);
    return +d[Math.floor(d.length / 2)].toFixed(3);
  };
  const on = [], off = [], hidden = [];
  for (let k = 0; k < 4; k++) {
    shafts.visible = true; shafts.material.depthTest = true; shafts.material.needsUpdate = true; on.push(measure());
    shafts.visible = true; shafts.material.depthTest = false; shafts.material.needsUpdate = true; off.push(measure());
    shafts.visible = false; hidden.push(measure());
  }
  shafts.visible = true; shafts.material.depthTest = true; shafts.material.needsUpdate = true;
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length/2)].toFixed(3) };
  return { depthTestOn: med(on), depthTestOff: med(off), shaftsHidden: med(hidden), raw: { on, off, hidden } };
`
for (const [i, vp] of viewportsFrom(opts.viewports).entries()) {
  const { session, close } = await launch({ port: 9830 + i, width: vp.w, height: vp.h, unthrottled: true })
  try {
    await session.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1.5, mobile: false, screenWidth: vp.w, screenHeight: vp.h })
    await session.send('Page.navigate', { url: urlFor(opts, vp) })
    await session.once('Page.loadEventFired')
    await sleep(3000)
    for (let k = 0; k < 160; k++) { if (await session.eval(`return !!(window.__hero && window.__hero.debugHandles && window.__hero.debugHandles.scene)`)) break; await sleep(250) }
    console.log(`${vp.w}x${vp.h}`, JSON.stringify(await session.eval(PROBE), null, 1))
  } finally { close() }
}
