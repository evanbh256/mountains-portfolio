// Time from navigation to the first rendered frame, and where that time goes.
//
// The scene's plans (grass, flora, trail, Nepal props) are built synchronously on first use,
// so a density change shows up here before it shows up anywhere else.
//
//   node tools/ui-audit/load.mjs --viewports 1132

import { launch, sleep } from './cdp.mjs'
import { parseArgs, urlFor, viewportsFrom } from './args.mjs'

const opts = parseArgs()

for (const [i, vp] of viewportsFrom(opts.viewports).entries()) {
  const { session, close } = await launch({ port: 9900 + i, width: vp.w, height: vp.h })
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: opts.dpr, mobile: !!vp.mobile,
      screenWidth: vp.w, screenHeight: vp.h,
    })
    const t0 = Date.now()
    await session.send('Page.navigate', { url: urlFor(opts, vp) })
    await session.once('Page.loadEventFired')
    const loadEvent = Date.now() - t0
    let ready = null
    for (let k = 0; k < 600; k++) {
      if (await session.eval(`return !!(window.__hero && window.__hero.sceneStats.triangles > 0)`)) {
        ready = Date.now() - t0
        break
      }
      await sleep(50)
    }
    // Where the time goes: each plan built cold, timed in the page.
    const breakdown = await session.eval(`
      const time = async (name, fn) => {
        const a = performance.now();
        await fn();
        return [name, +(performance.now() - a).toFixed(1)];
      };
      const out = [];
      out.push(await time('grassPlan', async () => (await import('/src/scene/grassPlan.ts')).buildGrassPlan()));
      out.push(await time('floraPlan', async () => (await import('/src/scene/nepal/floraPlan.ts')).buildFloraPlan()));
      out.push(await time('nepalPlan', async () => (await import('/src/scene/nepal/plan.ts')).buildNepalPlan()));
      out.push(await time('trailPlan', async () => (await import('/src/scene/nepal/trailPlan.ts')).buildTrailPlan()));
      return out;
    `)
    console.log(`\n=== ${vp.w}x${vp.h} ===`)
    console.log(`  load event      ${loadEvent}ms`)
    console.log(`  first frame     ${ready}ms`)
    console.log('  rebuilt cold (not additive with the above, but shows the shape):')
    for (const [name, ms] of breakdown) console.log(`    ${name.padEnd(12)} ${ms}ms`)
  } finally {
    close()
  }
}
