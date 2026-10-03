// Where does the frame time actually go?
//
// Hides each top-level scene object in turn and re-measures throughput at a pose, so density
// work can be aimed at whatever is actually expensive instead of at whatever looks heavy.
// Measurements are interleaved (every object is measured against a baseline taken in the
// same session) because absolute timings on this machine drift more than most single
// objects cost.
//
//   node tools/ui-audit/cost.mjs --viewports 1440 --pose 0.033

import { launch, sleep } from './cdp.mjs'
import { parseArgs, urlFor, viewportsFrom } from './args.mjs'

const opts = parseArgs()
const POSE = Number(opts.pose ?? 0.033)
const ROUNDS = Number(opts.rounds ?? 2)

const PROBE = `
  const h = window.__hero, root = document.getElementById('scroll-root');
  const gl = h.debugHandles.gl, scene = h.debugHandles.scene, camera = h.debugHandles.camera;
  if (!gl || !scene || !camera) return { error: 'no scene handles' };
  root.scrollTo({ top: ${POSE} * (root.scrollHeight - root.clientHeight), behavior: 'instant' });
  await new Promise((r) => setTimeout(r, 1800));

  const ctx = gl.getContext();
  const px = new Uint8Array(4);
  const measure = () => {
    const d = [];
    let last = performance.now();
    for (let i = 0; i < 40; i++) {
      gl.render(scene, camera);
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      const now = performance.now(); d.push(now - last); last = now;
    }
    d.sort((a, b) => a - b);
    return d[Math.floor(d.length / 2)];
  };

  // Grouped by material: every grass chunk shares one, every rock shares one, and so on.
  // Individual objects cost far less than this machine's drift over a long run, so they are
  // measured as the groups a change would actually act on.
  const groups = new Map();
  scene.traverse((o) => {
    if (!o.isMesh && !o.isSprite && !o.isPoints) return;
    if (!o.visible || !o.material) return;
    const key = o.material.uuid;
    if (!groups.has(key)) {
      groups.set(key, { objs: [], tris: 0, instances: 0, kind: o.type, mat: o.material.type });
    }
    const g = groups.get(key);
    g.objs.push(o);
    const n = o.isInstancedMesh ? o.count : 1;
    g.instances += n;
    const idx = o.geometry && o.geometry.index;
    g.tris += ((idx ? idx.count : (o.geometry && o.geometry.attributes.position ? o.geometry.attributes.position.count : 0)) / 3) * n;
  });

  const list = [...groups.values()];
  const totals = list.map(() => 0);
  let baseTotal = 0;
  const ROUNDS = ${ROUNDS};
  for (let r = 0; r < ROUNDS; r++) {
    baseTotal += measure();
    for (let i = 0; i < list.length; i++) {
      for (const o of list[i].objs) o.visible = false;
      totals[i] += measure();
      for (const o of list[i].objs) o.visible = true;
    }
  }
  const base = baseTotal / ROUNDS;
  const rows = list.map((g, i) => ({
    kind: g.kind, mat: g.mat, objects: g.objs.length,
    instances: g.instances, tris: Math.round(g.tris),
    costMs: +(base - totals[i] / ROUNDS).toFixed(2),
  }));
  rows.sort((a, b) => b.costMs - a.costMs);
  return { base: +base.toFixed(2), rows };
`

for (const [i, vp] of viewportsFrom(opts.viewports).entries()) {
  const { session, close } = await launch({ port: 9860 + i, width: vp.w, height: vp.h, unthrottled: true })
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: Number(opts.dpr ?? 1.5), mobile: !!vp.mobile,
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
    console.log(`\n=== ${vp.w}x${vp.h} @dpr${opts.dpr ?? 1.5} pose ${POSE} === whole frame ${r.base}ms`)
    for (const row of r.rows) {
      const pct = ((row.costMs / r.base) * 100).toFixed(0)
      console.log(
        `  ${String(row.costMs).padStart(6)}ms (${String(pct).padStart(4)}%)  ` +
          `${(row.kind + '/' + row.mat).padEnd(30)} ${String(row.objects).padStart(3)} obj  ` +
          `${String(row.instances).padStart(6)} inst  ${String(row.tris).padStart(7)} tris`,
      )
    }
  } finally {
    close()
  }
}
