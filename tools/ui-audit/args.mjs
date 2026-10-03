// Shared argument parsing and viewport list for the audit tools.

export const VIEWPORTS = {
  '1440': { w: 1440, h: 900 },
  '1280': { w: 1280, h: 800 },
  '1132': { w: 1132, h: 764 },
  '1024': { w: 1024, h: 768 },
  '768': { w: 768, h: 1024 },
  '390': { w: 390, h: 844, mobile: true },
}

const DEFAULTS = {
  url: 'http://localhost:5174/',
  out: 'docs/ui-audit/before',
  dpr: 1.5,
  viewports: '1132,1440,390',
  /** Milliseconds to wait after a scroll before capturing: damping needs about a second. */
  settle: 2000,
  /** Summit sweep step, px. */
  step: 350,
}

/** `--key value` and `--key=value`, with the defaults above. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { ...DEFAULTS }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const eq = arg.indexOf('=')
    const key = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1)
    out[key] = value
  }
  out.dpr = Number(out.dpr)
  out.settle = Number(out.settle)
  out.step = Number(out.step)
  return out
}

export function viewportsFrom(spec) {
  return String(spec)
    .split(',')
    .map((k) => {
      const vp = VIEWPORTS[k.trim()]
      if (!vp) throw new Error(`unknown viewport "${k}" (have ${Object.keys(VIEWPORTS).join(', ')})`)
      return vp
    })
}

/**
 * The URL to load for a viewport, with the quality tier pinned.
 *
 * Headless Chrome reports `(pointer: coarse)` even at a desktop viewport, so the scene's own
 * device check puts it on the phone tier: 128-segment terrain instead of 224, half the grass
 * and half the Nepal-layer density. Two capture runs then differ by what the browser claimed
 * to be rather than by the change under test. Desktop viewports are pinned to the full tier
 * and phone viewports left to decide for themselves, which is what a real visitor gets.
 *
 * `perf=off` pins the frame-time guard too: several headless browsers on one machine make
 * frames genuinely slow, and the guard correctly - but unhelpfully - steps grass down
 * part-way through a run.
 */
export function urlFor(opts, vp) {
  const u = new URL(opts.url)
  u.searchParams.set('perf', 'off')
  if (!vp.mobile) {
    u.searchParams.set('q', 'high')
    u.searchParams.set('nepal-density', 'full')
  }
  return u.toString()
}
