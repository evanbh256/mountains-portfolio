// Where the summit's fixed elements land on screen once the camera has parked, and how
// much of them the terrain hides.
//
// The summit rail and its glass panel share the last frame with the stupa, and "clear of the
// stupa" only means something in screen pixels. This projects the chorten's bounding box,
// its radial flag poles and the sun into the viewport at the pose the camera parks in.
//
//   node tools/ui-audit/summit.mjs --viewports 1132,1440

import { launch, sleep } from './cdp.mjs'
import { parseArgs, urlFor, viewportsFrom } from './args.mjs'

const opts = parseArgs()

const PROBE = `
  const h = window.__hero;
  const root = document.getElementById('scroll-root');
  // Park at the summit: anywhere past the climb track holds t = 1.
  root.scrollTo({ top: h.heroLayout.track + 20, behavior: 'instant' });
  await new Promise((r) => setTimeout(r, 1500));

  const plan = (await import('/src/scene/nepal/plan.ts')).getNepalPlan();
  const cfg = await import('/src/scene/nepal/config.ts');
  const atmo = await import('/src/scene/atmosphere.ts');
  const renderer = h.debugHandles.gl;
  const scene = h.debugHandles.scene;
  if (!renderer || !scene) return { error: 'no scene handle' };

  const camera = h.debugHandles.camera;
  if (!camera) return { error: 'no camera handle' };

  const W = window.innerWidth, H = window.innerHeight;
  const project = (x, y, z) => {
    const v = new camera.position.constructor(x, y, z);
    v.project(camera);
    return { x: Math.round((v.x * 0.5 + 0.5) * W), y: Math.round((-v.y * 0.5 + 0.5) * H), z: +v.z.toFixed(3) };
  };
  const boxOf = (pts) => {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return {
      x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys),
      behind: pts.some((p) => p.z > 1),
    };
  };

  // Chorten: base footprint corners, up to the finial.
  const main = plan.chortens[0];
  const half = 2.7 * main.scale;
  const top = main.position.y + cfg.CHORTEN_UNIT_HEIGHT * main.scale;
  const corners = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const yy of [main.position.y, top]) {
    corners.push(project(main.position.x + sx * half, yy, main.position.z + sz * half));
  }
  const chorten = boxOf(corners);

  // Radial flag poles and their cords.
  const PANEL = (await import('/src/summit/layout.ts')).PANEL_ZONE;
  const poleHits = plan.radial.poles.map((p, i) => {
    const top = project(p.base.x, p.base.y + p.height, p.base.z);
    const foot = project(p.base.x, p.base.y, p.base.z);
    const inPanel =
      Math.max(top.x, foot.x) > PANEL.x0 * W && Math.min(top.x, foot.x) < PANEL.x1 * W &&
      Math.max(top.y, foot.y) > PANEL.y0 * H && Math.min(top.y, foot.y) < PANEL.y1 * H;
    return { i, xPct: +(top.x / W * 100).toFixed(1), yPct: +(top.y / H * 100).toFixed(1), inPanel };
  });
  const flagPts = [];
  for (const p of plan.radial.poles) flagPts.push(project(p.base.x, p.base.y + p.height, p.base.z));
  for (const cord of plan.radial.cords) for (const pt of cord) flagPts.push(project(pt.x, pt.y, pt.z));
  const flags = boxOf(flagPts);

  // Sun: project a point far along the sun direction.
  const a = atmo.atmosphereAt(1);
  const sunAt = project(
    camera.position.x + a.sunDir.x * 900,
    camera.position.y + a.sunDir.y * 900,
    camera.position.z + a.sunDir.z * 900,
  );

  // What the parked camera actually sees: terrain between it and a point hides the point.
  // A box that fits the frame is not enough - the old chorten fitted and was half buried.
  const terrain = await import('/src/scene/terrain.ts');
  const V = camera.position.constructor;
  const seen = (p) => {
    const c = camera.position;
    for (let i = 1; i < 120; i++) {
      const u = i / 120;
      if (terrain.surfaceHeightAt(c.x + (p.x - c.x) * u, c.z + (p.z - c.z) * u) > c.y + (p.y - c.y) * u + 0.03) return false;
    }
    return true;
  };
  let hidden = 1;
  for (let k = 0; k <= 40; k++) {
    if (seen(new V(main.position.x, main.position.y + (top - main.position.y) * k / 40, main.position.z))) { hidden = k / 40; break; }
  }

  // Every peg is either out of sight or in view with its cord: a post whose top shows while
  // the cord and flags tied to it are hidden reads as a stray line in the scene.
  const pegs = plan.radial.poles.map((p, i) => {
    const topPt = new V(p.base.x, p.base.y + p.height, p.base.z);
    const tail = plan.radial.cords[i].slice(-6).filter(seen).length;
    const topSeen = seen(topPt);
    return { i, topSeen, cordTailSeen: tail + '/6', orphan: topSeen && tail < 3 };
  });

  return {
    chortenHiddenPct: Math.round(hidden * 100),
    pegs,
    viewport: { W, H },
    camera: { x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2), fov: camera.fov },
    chorten, flags, sun: sunAt, poleHits,
    chortenPct: { x0: +(chorten.x0 / W * 100).toFixed(1), x1: +(chorten.x1 / W * 100).toFixed(1), y0: +(chorten.y0 / H * 100).toFixed(1), y1: +(chorten.y1 / H * 100).toFixed(1) },
    sunPct: { x: +(sunAt.x / W * 100).toFixed(1), y: +(sunAt.y / H * 100).toFixed(1) },
  };
`

for (const [i, vp] of viewportsFrom(opts.viewports).entries()) {
  const { session, close } = await launch({ port: 9600 + i, width: vp.w, height: vp.h })
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: !!vp.mobile,
      screenWidth: vp.w, screenHeight: vp.h,
    })
    await session.send('Page.navigate', { url: urlFor(opts, vp) })
    await session.once('Page.loadEventFired')
    await sleep(5000)
    console.log(`\n=== ${vp.w}x${vp.h} ===`)
    console.log(JSON.stringify(await session.eval(PROBE), null, 1))
  } finally {
    close()
  }
}
