// Measure where each climb beat's copy sits, per frame shape, for the tree clearance rule.
//
// `treeBehindCopy` in src/scene/nepal/anchors.ts keeps every tree out from behind the copy
// while it is on screen. It needs the copy's footprint as a fraction of the frame, which
// depends on the type scale in index.css: re-run this after any change to it and paste the
// table it prints over COPY_ZONES.
//
//   node tools/ui-audit/copyzone.mjs
//
// For each beat it reads the union of the text block's children (pill to last line), undoes
// the slide the ticker is currently applying, then allows for the full slide both ways
// (beats rise BEAT_SLIDE_PX into place and leave by the same), plus a buffer.

import { launch, sleep } from './cdp.mjs'

/** Viewports grouped by the frame shape the rule tests at. */
const SHAPES = [
  { aspect: '4 / 3', sizes: [[1024, 768]] },
  { aspect: '1132 / 764', sizes: [[1132, 764]] },
  { aspect: '1.6', sizes: [[1280, 800], [1440, 900]] },
  { aspect: '16 / 9', sizes: [[1366, 768], [1920, 1080]] },
]
/** Clear space kept round the copy, in percent of the frame. */
const BUFFER = 2.5

const MEASURE = `
  const cfg = await import('/src/scene/config.ts');
  const W = innerWidth, H = innerHeight;
  // The climb beats: the text block inside each beat article (not the summit chapters).
  const blocks = [...document.querySelectorAll('#hero > div > article[aria-labelledby^="beat-"] > div')];
  return blocks.map((div) => {
    let x1 = -1e9, y0 = 1e9;
    // The text itself, line by line, not the element boxes: a paragraph's box is as wide as
    // its max-width even where every line stops short of it. The pill is a box with a
    // painted background, so it counts whole.
    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (!r.width) continue;
        x1 = Math.max(x1, r.right);
        y0 = Math.min(y0, r.top);
      }
    }
    for (const pill of div.querySelectorAll('.beat-pill, .section-name')) {
      const r = pill.getBoundingClientRect();
      x1 = Math.max(x1, r.right);
      y0 = Math.min(y0, r.top);
    }
    const m = new DOMMatrix(getComputedStyle(div).transform);
    const rest = y0 - m.m42;
    return { x1: (x1 / W) * 100, y0: ((rest - cfg.BEAT_SLIDE_PX) / H) * 100 };
  });
`

const table = []
let port = 9960
for (const shape of SHAPES) {
  let x1 = 0
  let y0 = null
  for (const [w, h] of shape.sizes) {
    const { session, close } = await launch({ port: port++, width: w, height: h })
    try {
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: 1, mobile: false, screenWidth: w, screenHeight: h,
      })
      await session.send('Page.navigate', { url: 'http://localhost:5174/?perf=off&q=high' })
      await session.once('Page.loadEventFired')
      await sleep(3500)
      const beats = await session.eval(MEASURE)
      x1 = Math.max(x1, ...beats.map((b) => b.x1))
      y0 = y0 ? y0.map((v, i) => Math.min(v, beats[i].y0)) : beats.map((b) => b.y0)
    } finally {
      close()
    }
  }
  table.push({ aspect: shape.aspect, x1: +(x1 + BUFFER).toFixed(1), y0: y0.map((v) => +(v - BUFFER).toFixed(1)) })
}

console.log('export const COPY_ZONES: CopyZone[] = [')
for (const row of table) console.log(`  { aspect: ${row.aspect}, x1: ${row.x1}, y0: [${row.y0.join(', ')}] },`)
console.log(']')
process.exit(0)
