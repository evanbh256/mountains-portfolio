// Keyboard reachability: what a Tab walk actually lands on, whether the summit rail and its
// panels can be driven without a pointer, and whether the scroll keys still work.
//
// The only controls on the page are the rail's seven buttons and whatever is inside the open
// panel. On the climb the rail is hidden, so nothing may be focusable there; at the summit a
// keyboard user has to be able to walk the rail top to bottom, open a section, read it with
// the arrow keys, follow its links and get back out with Esc to where they were.
//
// Keys are sent through the DevTools Protocol, so they take the same path as a real key
// press: a synthetic KeyboardEvent would not move focus on Tab or press a button on Enter.
//
//   node tools/ui-audit/keyboard.mjs --viewports 1132

import { launch, sleep } from './cdp.mjs'
import { parseArgs, urlFor, viewportsFrom } from './args.mjs'

const opts = parseArgs()
let failures = 0

const KEYS = { Tab: 9, Enter: 13, Escape: 27, PageDown: 34, ArrowDown: 40 }

const FOCUSABLES = `
  const focusables = () => [...document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => {
      if (el.closest('[inert]')) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.visibility === 'hidden' || s.display === 'none') return false;
      }
      return true;
    })
    .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 26));
`

const FOCUS = `
  const a = document.activeElement;
  return {
    text: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 26),
    tag: a.tagName,
    inPanel: a.closest('.summit-panel') ? a.closest('.summit-panel').id : null,
    inRail: !!a.closest('.summit-rail'),
  };
`

for (const [i, vp] of viewportsFrom(opts.viewports).entries()) {
  const { session, close } = await launch({ port: 9920 + i, width: vp.w, height: vp.h })
  const ev = (js) => session.eval(js)
  const key = async (k) => {
    const base = { key: k, code: k, windowsVirtualKeyCode: KEYS[k] }
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(k === 'Enter' ? { text: '\r' } : {}) })
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    await sleep(120)
  }
  const fail = (why) => {
    console.log(`  FAIL: ${why}`)
    failures++
  }
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: !!vp.mobile,
      screenWidth: vp.w, screenHeight: vp.h,
    })
    await session.send('Page.navigate', { url: urlFor(opts, vp) })
    await session.once('Page.loadEventFired')
    await sleep(3500)
    console.log(`\n=== ${vp.w}x${vp.h} ===`)

    const jump = async (where) => {
      await ev(`const l = window.__hero.rig.lenis; l.scrollTo(${where}, { immediate: true, force: true }); return true`)
      await sleep(1200)
    }

    // 1. The climb: nothing to focus, at the top or half-way up.
    for (const [name, where] of [['top', '0'], ['mid-climb', 'l.limit * 0.5']]) {
      await jump(where)
      const found = await ev(`${FOCUSABLES} return focusables()`)
      console.log(`  ${name.padEnd(10)} ${found.length} focusable  ${found.join(' | ') || '(none)'}`)
      if (found.length > 0) fail(`something is focusable on the climb (${name}), where there are no controls`)
    }

    // 2. Scroll keys go through Lenis, which owns #scroll-root.
    await jump('0')
    await key('PageDown')
    await sleep(900)
    const moved = await ev(`return Math.round(document.getElementById('scroll-root').scrollTop)`)
    console.log(`  PageDown moved the page by ${moved}px`)
    if (moved < 100) fail('PageDown did not scroll the page')

    // 3. The summit: the rail, and only the rail.
    await jump('l.limit')
    const rail = await ev(`${FOCUSABLES}
      const buttons = [...document.querySelectorAll('.summit-rail-item')];
      return {
        found: focusables(),
        wiring: buttons.map((b) => {
          const panel = document.getElementById(b.getAttribute('aria-controls') || '');
          const title = panel && document.getElementById(panel.getAttribute('aria-labelledby') || '');
          return {
            label: b.textContent.trim(), tag: b.tagName, expanded: b.getAttribute('aria-expanded'),
            panel: !!panel, role: panel && panel.getAttribute('role'), title: title ? title.textContent.trim() : null,
          };
        }),
      };`)
    console.log(`  summit     ${rail.found.length} focusable  ${rail.found.join(' | ')}`)
    if (rail.found.length !== rail.wiring.length) fail(`${rail.found.length} things are focusable at the summit but the rail has ${rail.wiring.length} items`)
    for (const w of rail.wiring) {
      if (w.tag !== 'BUTTON') fail(`rail item "${w.label}" is a ${w.tag}, not a button`)
      if (w.expanded !== 'false') fail(`rail item "${w.label}" has aria-expanded="${w.expanded}" with nothing open`)
      if (!w.panel || w.role !== 'dialog' || !w.title) fail(`rail item "${w.label}" does not control a labelled dialog`)
    }

    // 4. Tab walks the rail top to bottom.
    await ev(`document.querySelector('.summit-rail-item').focus(); return true`)
    const walk = []
    for (let k = 0; k < rail.wiring.length; k++) {
      walk.push((await ev(FOCUS)).text)
      await key('Tab')
    }
    console.log(`  Tab walk   ${walk.join(' > ')}`)
    if (walk.join('|') !== rail.wiring.map((w) => w.label).join('|')) fail('Tab does not walk the rail in order')

    // 5. Enter opens a section and moves focus into it. Projects: it carries links.
    await ev(`document.querySelector('[aria-controls="summit-panel-projects"]').focus(); return true`)
    await key('Enter')
    await sleep(600)
    const opened = await ev(`${FOCUSABLES}
      const b = document.querySelector('[aria-controls="summit-panel-projects"]');
      const a = document.activeElement;
      return { expanded: b.getAttribute('aria-expanded'), hash: location.hash,
        focusIn: a.closest('.summit-panel') ? a.closest('.summit-panel').id : null, found: focusables() };`)
    console.log(`  Enter      expanded=${opened.expanded} ${opened.hash} focus in ${opened.focusIn}; ${opened.found.length} focusable`)
    if (opened.expanded !== 'true') fail('Enter on a rail item did not open its panel')
    if (opened.focusIn !== 'summit-panel-projects') fail('focus did not move into the opened panel')
    if (opened.hash !== '#projects') fail('the URL hash did not follow the open panel')

    // 6. Tab from there reaches the panel's links.
    const inside = []
    for (let k = 0; k < 3; k++) {
      await key('Tab')
      const f = await ev(FOCUS)
      if (f.inPanel) inside.push(f.text)
    }
    console.log(`  in panel   ${inside.join(' > ') || '(nothing)'}`)
    if (!inside.some((t) => t.includes('github.com'))) fail('Tab did not reach a link inside the open panel')

    // 7. Esc closes it and puts focus back on the rail item.
    await key('Escape')
    await sleep(500)
    const closed = await ev(`
      const b = document.querySelector('[aria-controls="summit-panel-projects"]');
      return { expanded: b.getAttribute('aria-expanded'), focusOnButton: document.activeElement === b, hash: location.hash };`)
    console.log(`  Esc        expanded=${closed.expanded} focus back on rail item: ${closed.focusOnButton} hash "${closed.hash}"`)
    if (closed.expanded !== 'false') fail('Esc did not close the panel')
    if (!closed.focusOnButton) fail('focus did not return to the rail item on close')
    if (closed.hash !== '') fail('the URL hash was left behind after closing')

    // 8. Arrow keys read the panel; they do not scroll the page out from under it.
    await ev(`document.querySelector('[aria-controls="summit-panel-competitions"]').focus(); return true`)
    await key('Enter')
    await sleep(600)
    const pos = `
      const b = document.querySelector('#summit-panel-competitions .glass-body');
      return { panel: Math.round(b.scrollTop), room: Math.round(b.scrollHeight - b.clientHeight), page: Math.round(document.getElementById('scroll-root').scrollTop) };`
    const before = await ev(pos)
    for (let k = 0; k < 3; k++) await key('ArrowDown')
    await sleep(500)
    const after = await ev(pos)
    console.log(`  ArrowDown  panel ${before.panel} -> ${after.panel}px (of ${before.room}), page ${before.page} -> ${after.page}px`)
    if (after.page !== before.page) fail('arrow keys inside a panel scrolled the page')
    if (before.room > 0 && after.panel <= before.panel) fail('arrow keys did not scroll the open panel')
  } finally {
    close()
  }
}

console.log(failures ? `\n${failures} keyboard check(s) fail` : '\nkeyboard checks pass')
process.exit(failures ? 1 : 0)
