// Two things the audit requires and that are cheap to get wrong:
//
//   1. the frame never loses all contrast (the whiteout inside the cloud layer)
//   2. every piece of copy clears WCAG AA, 4.5:1, wherever it is on the page
//
// Both are measured from the composited screenshot rather than from the source colours,
// because what matters is what ends up on screen: the copy sits in the DOM over a WebGL
// canvas, and the summit panels are tinted glass over it, so the real background is the
// render as the glass bends and tints it. Ink and paper are separated by percentile inside
// each text element's own box.
//
// Stops: the climb, the summit with the rail alone, and the summit with each panel open.
// Headless Chrome takes prefers-reduced-transparency from the OS (on Windows, "Transparency
// effects"), so it is pinned: no-preference by default, --transparency reduce to match a
// machine with that switch off. The summit glass currently looks the same either way.
//
//   node tools/ui-audit/contrast.mjs --viewports 1132,1440
//   node tools/ui-audit/contrast.mjs --viewports 390 --transparency reduce

import { launch, sleep } from './cdp.mjs'
import { parseArgs, urlFor, viewportsFrom } from './args.mjs'

const opts = parseArgs()
const MIN_RATIO = Number(opts.min ?? 4.5)
/** Frame luminance range (2nd to 98th percentile) below which the frame reads as blank. */
const MIN_FRAME_RANGE = Number(opts.minRange ?? 90)

/** Copy is sampled at rest, not mid-fade: an element below this opacity is skipped. */
const MIN_OPACITY = 0.98

const lin = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const luminance = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * Every element in the hero that actually paints text, with its own declared colour.
 *
 * Containers are skipped: a card body declares `text-ink` at full strength while the dates
 * inside it are `text-ink/60`, so measuring the container would pass the block and miss the
 * one line in it that fails. Only elements with their own non-empty text node count.
 */
const TARGETS = `
  const out = [];
  const label = (el) => {
    if (el.closest('.summit-rail')) return 'rail';
    if (el.closest('.summit-panel')) return 'panel';
    if (el.matches('h1, h2')) return 'headline';
    if (el.classList.contains('beat-pill') || el.classList.contains('section-name')) return 'section name';
    if (el.classList.contains('nepal-sub')) return 'devanagari';
    return 'copy';
  };
  const roots = [document.getElementById('hero'), document.querySelector('.summit-nav')].filter(Boolean);
  for (const el of roots.flatMap((root) => [...root.querySelectorAll('*')])) {
    // Only elements that paint their own text, not wrappers around other elements.
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
    own = own.trim();
    if (own.length < 2) continue;
    let r = el.getBoundingClientRect();
    // Inside a panel's scroller only the part inside its unfaded middle is on screen as
    // itself (summit.css fades the top 10px and bottom 28px).
    const scroller = el.closest('.glass-body');
    if (scroller) {
      const b = scroller.getBoundingClientRect();
      const top = Math.max(r.top, b.top + 10), bottom = Math.min(r.bottom, b.bottom - 28);
      r = { left: r.left, right: r.right, width: r.width, top, bottom, height: bottom - top };
    }
    // On a phone the rail scrolls sideways inside its pill, which clips it: a label scrolled
    // past the pill's end is not drawn, and the scene beside the pill is not its paper.
    const rail = el.closest('.summit-rail-list');
    if (rail) {
      const b = rail.getBoundingClientRect();
      const left = Math.max(r.left, b.left), right = Math.min(r.right, b.right);
      r = { left, right, width: right - left, top: r.top, bottom: r.bottom, height: r.height };
    }
    if (r.width < 8 || r.height < 6) continue;
    if (r.bottom < 2 || r.top > innerHeight - 2 || r.right < 2 || r.left > innerWidth - 2) continue;
    let o = 1, n = el, skip = false;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') { skip = true; break }
      o *= parseFloat(cs.opacity || '1');
      n = n.parentElement;
    }
    if (skip) continue;
    const cs = getComputedStyle(el);
    // The backdrop this text sits on, as CSS sees it: walk outward collecting background
    // layers until one is opaque. If the chain closes, the paper is known exactly and no
    // pixel guessing is needed - which is what makes small light text on a solid badge
    // measurable at all. If it never closes, the WebGL canvas is the backdrop and the
    // caller falls back to sampling the render.
    const layers = [];
    let opaque = false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      // Parsed without a regex on purpose: this whole block is inside a template literal,
      // where a backslash is eaten before the page ever sees it, so /\\d/ silently becomes
      // /d/ and every colour fails to match. Splitting is escape-free and cannot rot.
      const open = bg.indexOf('(');
      if (open < 0) continue;
      const parts = bg
        .slice(open + 1, bg.lastIndexOf(')'))
        .split(',').join(' ').split('/').join(' ')
        .split(' ').filter(Boolean).map(Number);
      if (parts.length < 3 || !Number.isFinite(parts[0])) continue;
      const a = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
      if (a <= 0.001) continue;
      layers.push([parts[0], parts[1], parts[2], a]);
      if (a >= 0.999) { opaque = true; break }
    }
    out.push({
      label: label(el), opacity: +o.toFixed(3),
      layers, opaqueBackdrop: opaque,
      color: cs.color, fontSize: parseFloat(cs.fontSize), weight: cs.fontWeight,
      text: own.slice(0, 30),
      rect: { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)),
              w: Math.round(Math.min(r.width, innerWidth - r.left)),
              h: Math.round(Math.min(r.height, innerHeight - r.top)) },
    });
  }
  return out;
`

const RGBA = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/

/**
 * Contrast of one text element, computed the accurate way.
 *
 * Reading the ink straight out of the screenshot understates it badly: at 11-12px most of a
 * glyph is anti-aliased edge, so even the darkest percentile is a blend rather than the
 * declared colour, and a dense block has few solid pixels to find. Instead the declared
 * colour and its alpha come from the DOM, the paper is measured from the pixels (the
 * majority of any text box is background), and the two are composited the way the browser
 * did it. That is the number WCAG asks for.
 */
function analyse(png, t) {
  const { data, width } = png
  const rect = t.rect
  const m = RGBA.exec(t.color || '')
  if (!m) return null
  const ink = [Number(m[1]), Number(m[2]), Number(m[3])]
  const alpha = m[4] === undefined ? 1 : Number(m[4])

  // Known backdrop: composite the CSS layers from the outermost opaque one inward.
  if (t.opaqueBackdrop && t.layers.length) {
    let paper = t.layers[t.layers.length - 1].slice(0, 3)
    for (let i = t.layers.length - 2; i >= 0; i--) {
      const [r, g, b, a] = t.layers[i]
      paper = [r * a + paper[0] * (1 - a), g * a + paper[1] * (1 - a), b * a + paper[2] * (1 - a)]
    }
    const over = ink.map((c, i) => c * alpha + paper[i] * (1 - alpha))
    return {
      ratio: +ratio(luminance(over[0], over[1], over[2]), luminance(paper[0], paper[1], paper[2])).toFixed(2),
      from: 'css',
    }
  }

  const px = []
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = (y * width + x) * 4
      px.push([data[i], data[i + 1], data[i + 2], luminance(data[i], data[i + 1], data[i + 2])])
    }
  }
  if (px.length < 40) return null
  px.sort((a, b) => a[3] - b[3])
  // Which end of the distribution is the paper depends on which end the ink is. Light text
  // on a dark badge fills the bright end with glyphs, so taking a high percentile there
  // returns the text itself and reports white-on-white. Pick the end the ink is not at, and
  // stay off the extremes so a highlight or a neighbour's edge cannot stand in for paper.
  const at = (q) => px[Math.min(px.length - 1, Math.max(0, Math.floor(q * px.length)))]
  const inkIsLight = luminance(ink[0], ink[1], ink[2]) > 0.35
  const paperPx = inkIsLight ? at(0.15) : at(0.8)
  const paper = [paperPx[0], paperPx[1], paperPx[2]]
  const over = ink.map((c, i) => c * alpha + paper[i] * (1 - alpha))
  const lInk = luminance(over[0], over[1], over[2])
  const lPaper = luminance(paper[0], paper[1], paper[2])
  return { ratio: +ratio(lInk, lPaper).toFixed(2), from: 'pixels', paper: paper.map(Math.round) }
}

let failures = 0

for (const [vi, vp] of viewportsFrom(opts.viewports).entries()) {
  const { session, close } = await launch({ port: 9810 + vi, width: vp.w, height: vp.h })
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: !!vp.mobile,
      screenWidth: vp.w, screenHeight: vp.h,
    })
    await session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: opts.transparency === 'reduce' ? 'reduce' : 'no-preference' }],
    })
    await session.send('Page.navigate', { url: urlFor(opts, vp) })
    await session.once('Page.loadEventFired')
    await sleep(3000)
    for (let k = 0; k < 160; k++) {
      if (await session.eval(`return !!(window.__hero && window.__hero.sceneStats.triangles > 0)`)) break
      await sleep(250)
    }

    // Climb offsets, then the parked summit: the rail alone, and each panel open over it.
    const stops = await session.eval(`
      const climb = window.__hero.heroLayout.track;
      const out = [];
      for (let y = 0; y < climb; y += Math.round(climb / 12)) out.push({ name: 'climb@' + y, y });
      out.push({ name: 'summit', y: climb });
      for (const b of document.querySelectorAll('.summit-rail-item')) {
        out.push({ name: 'summit+' + b.getAttribute('aria-controls').replace('summit-panel-', ''), y: climb, open: b.getAttribute('aria-controls') });
      }
      return out;
    `)

    console.log(`\n=== ${vp.w}x${vp.h} ===`)
    for (const stop of stops) {
      await session.eval(`document.getElementById('scroll-root').scrollTo({ top: ${stop.y}, behavior: 'instant' }); return true`)
      await sleep(1100)
      if (stop.open) {
        await session.eval(`
          const b = document.querySelector('[aria-controls="${stop.open}"]');
          if (b.getAttribute('aria-expanded') !== 'true') b.click();
          return true`)
        await sleep(700)
      }
      const targets = await session.eval(TARGETS)
      const shot = await session.send('Page.captureScreenshot', { format: 'png' })
      const png = await decode(Buffer.from(shot.data, 'base64'), session)

      // Frame-wide range, for the whiteout check.
      const all = []
      for (let i = 0; i < png.data.length; i += 4 * 37) {
        all.push(luminance(png.data[i], png.data[i + 1], png.data[i + 2]))
      }
      all.sort((a, b) => a - b)
      const lo = all[Math.floor(all.length * 0.02)]
      const hi = all[Math.floor(all.length * 0.98)]
      const frameRange = Math.round((hi - lo) * 255)

      const bad = []
      if (frameRange < MIN_FRAME_RANGE) bad.push(`frame range ${frameRange}`)
      let checked = 0
      for (const t of targets) {
        if (t.opacity < MIN_OPACITY) continue
        const a = analyse(png, t)
        if (!a) continue
        checked++
        // WCAG counts 24px, or 18.66px at 700+, as large text, where the bar is 3:1.
        const large = t.fontSize >= 24 || (t.fontSize >= 18.66 && Number(t.weight) >= 700)
        const need = large ? 3 : MIN_RATIO
        if (a.ratio < need) bad.push(`${t.label} ${a.ratio}:1 need ${need} (${t.fontSize}px ${a.from} "${t.text}")`)
      }
      if (opts.list && stop.name === opts.list) {
        console.log(`
  --- type inventory at ${stop.name} ---`)
        const seen = new Set()
        for (const t of targets) {
          if (t.opacity < MIN_OPACITY) continue
          const a = analyse(png, t)
          if (!a) continue
          const key = `${t.label}|${t.fontSize}|${t.weight}|${t.color}`
          if (seen.has(key)) continue
          seen.add(key)
          console.log(
            `    ${t.label.padEnd(10)} ${String(t.fontSize).padStart(5)}px w${t.weight}  ${String(a.ratio).padStart(6)}:1 ${a.from.padEnd(6)} ${t.color.padEnd(26)} "${t.text}"`,
          )
        }
        console.log('')
      }
      if (bad.length) failures++
      console.log(
        `  ${stop.name.padEnd(18)} range ${String(frameRange).padStart(3)}  ` +
          `${String(checked).padStart(2)} elements  ` +
          (bad.length ? `FAIL: ${bad.join('; ')}` : 'ok'),
      )
    }
  } finally {
    close()
  }
}

console.log(failures ? `\n${failures} stop(s) fail` : '\nall stops pass')
process.exit(failures ? 1 : 0)

/** Decode a PNG to raw RGBA by handing it back to the page's own canvas. */
async function decode(buf, session) {
  const b64 = buf.toString('base64')
  const r = await session.eval(`
    const img = new Image();
    img.src = 'data:image/png;base64,${b64}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    return { width: c.width, height: c.height, data: Array.from(d.data) };
  `)
  return { width: r.width, height: r.height, data: r.data }
}
