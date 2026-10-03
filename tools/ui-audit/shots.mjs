// Screenshot the hero at a fixed list of scroll offsets, per viewport, and record the
// scene state at each one. Re-runnable: point --out at a different folder per phase and
// diff the sets.
//
//   node tools/ui-audit/shots.mjs --out docs/ui-audit/before
//   node tools/ui-audit/shots.mjs --out docs/ui-audit/phase-1b --viewports 1440,1132
//
// Flags: --url --out --dpr --viewports --settle --step

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { parseArgs, urlFor, viewportsFrom } from './args.mjs'

/** The climb offsets from the original audit brief; the summit is swept at --step. */
const CLIMB_OFFSETS = [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000, 6500]
const SUMMIT_FROM = 7000

const opts = parseArgs()
const pad = (n) => String(Math.round(n)).padStart(5, '0')

async function waitForScene(session) {
  for (let i = 0; i < 160; i++) {
    const r = await session.eval(`
      const h = window.__hero;
      const root = document.getElementById('scroll-root');
      return h && h.sceneStats && h.sceneStats.triangles > 0 && root
        ? { ok: true, max: root.scrollHeight - root.clientHeight }
        : { ok: false };
    `)
    if (r.ok) return r.max
    await sleep(250)
  }
  throw new Error('scene never reported triangles > 0 - is the dev server running?')
}

const STATE = `
  const h = window.__hero;
  const root = document.getElementById('scroll-root');
  return {
    scrollTop: Math.round(root.scrollTop),
    drift: Math.round(root.scrollTop - h.scrollStore.scroll),
    p: +h.scrollStore.p.toFixed(4),
    t: +h.scrollStore.t.toFixed(4),
    beat: h.scrollStore.beatIndex,
    covered: h.scrollStore.covered,
    tris: h.sceneStats.triangles,
    calls: h.sceneStats.calls,
    dpr: h.sceneStats.dpr,
    camY: +h.sceneStats.camY.toFixed(2),
    fog: +h.sceneStats.fogDensity.toFixed(5),
  };
`

const report = { url: opts.url, dpr: opts.dpr, capturedAt: new Date().toISOString(), viewports: [] }
const viewports = viewportsFrom(opts.viewports)

for (const [i, vp] of viewports.entries()) {
  const { session, close } = await launch({ port: 9333 + i, width: vp.w, height: vp.h })
  const dir = join(opts.out, `${vp.w}x${vp.h}`)
  mkdirSync(dir, { recursive: true })
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
    await sleep(2500)
    const max = await waitForScene(session)

    // --offsets 4800,6000 captures just those, for checking one fix quickly.
    let offsets
    if (opts.offsets) {
      offsets = String(opts.offsets).split(',').map(Number).filter((y) => y <= max)
    } else {
      offsets = CLIMB_OFFSETS.filter((y) => y <= max)
      for (let y = SUMMIT_FROM; y <= max; y += opts.step) offsets.push(y)
      if (offsets[offsets.length - 1] !== max) offsets.push(max)
    }

    const rows = []
    for (const y of offsets) {
      await session.eval(`document.getElementById('scroll-root').scrollTo({ top: ${y}, behavior: 'instant' }); return true`)
      await sleep(opts.settle)
      const state = await session.eval(STATE)
      const shot = await session.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(dir, `scroll-${pad(y)}.png`), Buffer.from(shot.data, 'base64'))
      rows.push({ requested: y, ...state })
      process.stdout.write(`  ${vp.w}x${vp.h} @${pad(y)}  t=${state.t}  beat=${state.beat}  ${state.tris} tris  ${state.calls} calls\n`)
    }
    report.viewports.push({ ...vp, maxScroll: max, rows })
  } finally {
    close()
  }
  await sleep(500)
}

mkdirSync(opts.out, { recursive: true })
writeFileSync(join(opts.out, 'shots.json'), JSON.stringify(report, null, 2))
console.log(`\n${report.viewports.reduce((n, v) => n + v.rows.length, 0)} shots -> ${opts.out}`)
