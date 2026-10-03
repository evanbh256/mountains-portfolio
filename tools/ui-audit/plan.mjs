import { launch, sleep } from './cdp.mjs'

const { session, close } = await launch({ port: 9500, width: 1440, height: 900 })
try {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900,
  })
  await session.send('Page.navigate', { url: 'http://localhost:5174/' })
  await session.once('Page.loadEventFired')
  await sleep(6000)

  const r = await session.eval(`
    const plan = (await import('/src/scene/nepal/plan.ts')).getNepalPlan();
    const flora = (await import('/src/scene/nepal/floraPlan.ts')).getFloraPlan();
    const scale = await import('/src/world/scale.ts');
    return {
      planIssues: plan.issues,
      chortens: plan.chortens.map(c => ({ y: +c.position.y.toFixed(2), scale: +c.scale.toFixed(3), height: +(c.scale * 7.35).toFixed(2) })),
      flagCount: plan.sets.reduce((n, s) => n + s.flags.length, 0),
poreCount: plan.sets.reduce((n, s) => n + s.poles.length, 0),
poleHeights: plan.sets.flatMap(s => s.poles.map(p => +p.height.toFixed(2))),
      radialFlags: plan.radial.flags.length,
      trees: flora.trees.length,
      conifers: flora.conifers.length,
      junipers: flora.junipers.length,
      treeHeights: flora.trees.slice(0, 4).map(t => +(t.scale * (scale.SIZES.rhododendron)).toFixed(2)),
      blossoms: flora.blossoms.length,
      shrubs: flora.shrubs.length,
      rejected: flora.rejected,
      tris: window.__hero.sceneStats.triangles,
      calls: window.__hero.sceneStats.calls,
    };
  `)
  console.log(JSON.stringify(r, null, 2))

  const errs = await session.eval(`return (window.__errors || []).slice(0, 10)`)
  console.log('page errors:', errs)
} finally {
  close()
}
