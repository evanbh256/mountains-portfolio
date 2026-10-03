// DEV-ONLY placement probe, loaded by hand from the browser console:
//   const P = await import('/src/scene/nepal/devProbe.ts')
// Nothing in the app imports this file, so it never reaches the build. Kept as a development
// aid (see "Debug flags" in README.md); some helpers target markup that no longer exists.

import { Vector3 } from 'three'
import { atmosphereAt } from '../atmosphere'
import { sampleCameraPath } from '../cameraPath'
import { CAMERA_FOV } from '../config'
import { surfaceHeightAt } from '../terrain.ts'
import { anchorAtT, cameraFrameAtT } from './anchors'

const p = new Vector3()
const l = new Vector3()

/** Screen position (% from left/top) of world point P from the camera pose at t. */
export function project(t: number, P: Vector3, aspect = 16 / 9) {
  sampleCameraPath(t, p, l)
  const f = l.clone().sub(p).normalize()
  const r = new Vector3(-f.z, 0, f.x).normalize()
  const u = new Vector3().crossVectors(r, f)
  const d = P.clone().sub(p)
  const x = d.dot(r)
  const y = d.dot(u)
  const z = d.dot(f)
  const th = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180)
  const dist = d.length()
  const dens = atmosphereAt(t).density
  return {
    sx: +(50 + (50 * x) / (z * th * aspect)).toFixed(1),
    sy: +(50 - (50 * y) / (z * th)).toFixed(1),
    z: +z.toFixed(1),
    dist: +dist.toFixed(1),
    vis: +Math.exp(-((dens * dist) ** 2)).toFixed(2),
  }
}

export function track(t0: number, t1: number, step: number): string {
  const rows: string[] = []
  for (let t = t0; t <= t1 + 1e-9; t += step) {
    sampleCameraPath(t, p, l)
    const pitch = (Math.atan2(l.y - p.y, Math.hypot(l.x - p.x, l.z - p.z)) * 180) / Math.PI
    rows.push(
      `t ${t.toFixed(3)} cam ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} ground ${surfaceHeightAt(p.x, p.z).toFixed(1)} pitch ${pitch.toFixed(1)} dens ${atmosphereAt(t).density.toFixed(4)}`,
    )
  }
  return rows.join('\n')
}

/** Ground height and its screen position on a grid in the camera's frame at t. */
export function scan(t: number, rights: number[], aheads: number[]): string {
  const rows = ['ahead | ' + rights.join(' | ')]
  for (const a of aheads) {
    const row: string[] = [String(a)]
    for (const r of rights) {
      const P = anchorAtT(t, { right: r, ahead: a }, true)
      const s = project(t, P)
      row.push(`${P.y.toFixed(0)}@${s.sx.toFixed(0)},${s.sy.toFixed(0)}`)
    }
    rows.push(row.join(' | '))
  }
  return rows.join('\n')
}

export { anchorAtT, cameraFrameAtT, surfaceHeightAt, Vector3 }

/* ---------------- test harness (hidden-pane friendly) ---------------- */

import { onFrame } from '../../scroll/ticker'

/** Frame pacing for the shim below; throughput() drops it to 0 to unthrottle. */
const pacing = { interval: 1000 / 60 }

type HeroHandle = {
  scrollToBeat: (i: number) => void
  scrollToY: (y: number) => void
  scrollStore: { t: number; velocity: number; time: number }
  sceneStats: { calls: number; triangles: number; dpr: number }
  debugHandles: { gl: { getContext: () => WebGL2RenderingContext } | null }
}

/**
 * A hidden preview pane stops requestAnimationFrame. Swap in a MessageChannel-paced 60 Hz
 * version; the app's tick re-registers through it on its next call (a screenshot kicks one).
 */
export function installRafShim(force = false): string {
  const w = window as unknown as { __rafShim?: boolean }
  if (w.__rafShim && !force) return 'already'
  const ch = new MessageChannel()
  let queue: [number, FrameRequestCallback][] = []
  let next = performance.now()
  let pending = false
  const pump = () => {
    if (!pending) {
      pending = true
      ch.port2.postMessage(0)
    }
  }
  ch.port1.onmessage = () => {
    pending = false
    const now = performance.now()
    if (now < next) return pump()
    next = Math.max(next + pacing.interval, now)
    const q = queue
    queue = []
    for (const [, cb] of q) cb(now)
    if (queue.length) pump()
  }
  let ids = 0
  window.requestAnimationFrame = (cb) => {
    queue.push([++ids, cb])
    pump()
    return ids
  }
  window.cancelAnimationFrame = (id) => {
    queue = queue.filter(([i]) => i !== id)
  }
  w.__rafShim = true
  return 'installed'
}

const hero = () => (window as unknown as { __hero: HeroHandle }).__hero

export const frames = (n: number) =>
  new Promise<void>((resolve) => {
    let k = 0
    const off = onFrame(() => {
      if (++k >= n) {
        off()
        resolve()
      }
    }, 998)
  })

export async function beat(i: number, settle = 150): Promise<void> {
  hero().scrollToBeat(i)
  await frames(settle)
}

/** Per-frame cost: scene callbacks + render + a 1-pixel readback that waits for the GPU. */
export async function cost(n = 180) {
  const ctx = hero().debugHandles.gl!.getContext()
  const px = new Uint8Array(4)
  const samples: number[] = []
  let t0 = 0
  const w0 = performance.now()
  const a = onFrame(() => {
    t0 = performance.now()
  }, 9)
  const b = onFrame(() => {
    ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
    samples.push(performance.now() - t0)
  }, 11)
  await frames(n)
  a()
  b()
  samples.sort((x, y) => x - y)
  const q = (p: number) => +samples[Math.floor(p * (samples.length - 1))]!.toFixed(2)
  return { fps: +(n / ((performance.now() - w0) / 1000)).toFixed(1), median: q(0.5), p90: q(0.9) }
}

/** Scroll so the eased progress lands on t (bisection on the easing, which is monotonic). */
export async function goT(t: number, settle = 150): Promise<void> {
  const { easeProgress } = await import('../../scroll/progress')
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (easeProgress(mid) < t) lo = mid
    else hi = mid
  }
  const h = window as unknown as { __hero: HeroHandle & { heroLayout: { heroTop: number; track: number } } }
  const L = h.__hero.heroLayout
  h.__hero.scrollToY(L.heroTop + ((lo + hi) / 2) * L.track)
  await frames(settle)
}

/** FNV-1a hash of the whole rendered frame, read right after the render in the same tick. */
export async function frameHash(): Promise<string> {
  const ctx = hero().debugHandles.gl!.getContext()
  const w = ctx.drawingBufferWidth
  const h = ctx.drawingBufferHeight
  const px = new Uint8Array(w * h * 4)
  await new Promise<void>((resolve) => {
    const off = onFrame(() => {
      ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
      off()
      resolve()
    }, 11)
  })
  let hash = 0x811c9dc5
  for (let i = 0; i < px.length; i++) hash = Math.imul(hash ^ px[i]!, 0x01000193)
  return (hash >>> 0).toString(16)
}

/** Wind uniforms over n frames: strength range and whether the phase ever steps backward. */
export async function recordWind(n: number) {
  const { nepalUniforms } = await import('./materials')
  let min = Infinity
  let max = -Infinity
  let back = 0
  let last = nepalUniforms.uWindPhase.value
  let maxStep = 0
  let maxV = 0
  await new Promise<void>((resolve) => {
    let k = 0
    const off = onFrame(() => {
      const s = nepalUniforms.uWindStrength.value
      const p = nepalUniforms.uWindPhase.value
      min = Math.min(min, s)
      max = Math.max(max, s)
      if (p < last) back++
      maxStep = Math.max(maxStep, p - last)
      maxV = Math.max(maxV, Math.abs(hero().scrollStore.velocity))
      last = p
      if (++k >= n) {
        off()
        resolve()
      }
    }, 12)
  })
  return { strength: [+min.toFixed(3), +max.toFixed(3)], phaseSteppedBack: back, maxPhaseStep: +maxStep.toFixed(4), maxVelocity: +maxV.toFixed(1) }
}

/**
 * Phase 2 audit: bright props inside a beat's text zone, slabs too close to the camera
 * track, and props that break the cloud-base rule.
 */
export async function auditProps() {
  const { getFloraPlan } = await import('./floraPlan')
  const { getTrailPlan } = await import('./trailPlan')
  const { inTextZoneAt } = await import('./anchors')
  const { SHRUBS, TRAIL } = await import('./config')
  const { beatCenter } = await import('../../scroll/progress')
  const flora = getFloraPlan()
  const trail = getTrailPlan()
  const beats = [0, 1, 2, 3, 4].map((i) => beatCenter(i))

  const inZone = { blossoms: 0, shrubs: 0, slabs: 0 }
  for (const t of beats) {
    for (const b of flora.blossoms) if (inTextZoneAt(t, b.position, 90)) inZone.blossoms++
    for (const sh of flora.shrubs) if (inTextZoneAt(t, sh.position, 70)) inZone.shrubs++
    for (const sl of trail.slabs) if (inTextZoneAt(t, sl.position, 70)) inZone.slabs++
  }

  // Closest a slab comes to the camera's own track, in plan.
  let nearest = Infinity
  const p = new Vector3()
  const l = new Vector3()
  for (let t = 0; t <= 1; t += 0.002) {
    sampleCameraPath(t, p, l)
    for (const sl of trail.slabs) nearest = Math.min(nearest, Math.hypot(sl.position.x - p.x, sl.position.z - p.z))
  }

  const aboveCloud = {
    shrubs: flora.shrubs.filter((s) => s.position.y > SHRUBS.maxY).length,
    slabs: trail.slabs.filter((s) => s.position.y > TRAIL.maxY).length,
    crowns: flora.blossoms.filter((b) => b.position.y > 30).length,
  }
  return { counts: { trees: flora.trees.length, blossoms: flora.blossoms.length, shrubs: flora.shrubs.length, slabs: trail.slabs.length, edges: trail.edges.length }, inZone, nearestSlabToTrack: +nearest.toFixed(2), aboveCloud, rejected: flora.rejected }
}

/* ---- throughput measurement (frame pacing removed) ---- */

/** Change the shim's pacing; 0 runs frames as fast as the GPU and CPU allow. */
export function setFrameInterval(ms: number): void {
  pacing.interval = ms
}

/**
 * Frames per second with pacing off: a throughput number that actually moves when the
 * scene gets heavier, unlike a vsync-limited per-frame timing.
 */
export async function throughput(n = 200) {
  const ctx = hero().debugHandles.gl!.getContext()
  const px = new Uint8Array(4)
  const before = pacing.interval
  setFrameInterval(0)
  const sync = onFrame(() => ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px), 11)
  const t0 = performance.now()
  await frames(n)
  const elapsed = performance.now() - t0
  sync()
  setFrameInterval(before)
  return { fps: +(n / (elapsed / 1000)).toFixed(1), msPerFrame: +(elapsed / n).toFixed(2) }
}

/**
 * GPU milliseconds per frame, measured with EXT_disjoint_timer_query_webgl2 around the
 * scene's render. Frame pacing and vsync make wall-clock timings useless here: presentation
 * is capped at the display rate, so only the GPU's own timer shows what the layer costs.
 */
export async function gpuTime(samples = 60) {
  const gl = hero().debugHandles.gl!.getContext()
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as {
    TIME_ELAPSED_EXT: number
    GPU_DISJOINT_EXT: number
  } | null
  if (!ext) return { error: 'EXT_disjoint_timer_query_webgl2 unavailable' }

  const pending: WebGLQuery[] = []
  const times: number[] = []
  let query: WebGLQuery | null = null

  const begin = onFrame(() => {
    query = gl.createQuery()
    if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query)
  }, 9)
  const end = onFrame(() => {
    if (!query) return
    gl.endQuery(ext.TIME_ELAPSED_EXT)
    pending.push(query)
    query = null
    // Drain whatever the driver has finished.
    for (let i = pending.length - 1; i >= 0; i--) {
      const q = pending[i]!
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
      gl.deleteQuery(q)
      pending.splice(i, 1)
    }
  }, 11)

  while (times.length < samples) await frames(10)
  begin()
  end()
  times.sort((a, b) => a - b)
  const q = (p: number) => +times[Math.floor(p * (times.length - 1))]!.toFixed(3)
  return { n: times.length, median: q(0.5), p90: q(0.9) }
}

/**
 * Contrast of the beat pill's crimson against what is actually behind it: the rendered
 * scene pixels under the pill, composited with the pill's own background, per beat.
 */
export async function pillContrast() {
  const gl = hero().debugHandles.gl!.getContext()
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
  const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const out: { beat: number; behind: string; composited: string; ratio: number }[] = []

  for (let i = 0; i < 5; i++) {
    await beat(i, 40)
    const pill = document.querySelector('.beat-pill:not(.beat-pill--light)')
    if (!pill) continue
    const style = getComputedStyle(pill)
    // Computed colours come back as rgba(...) or oklab(... / a); in both the fourth number
    // is the alpha, and there are only three when the colour is opaque.
    const parts = style.backgroundColor.match(/[\d.]+/g) ?? []
    const alpha = parts.length >= 4 ? Number(parts[3]) : 1
    const rect = pill.getBoundingClientRect()
    const dpr = gl.drawingBufferWidth / document.documentElement.clientWidth
    const x = Math.round((rect.left + rect.width / 2) * dpr)
    const y = Math.round((document.documentElement.clientHeight - rect.top - rect.height / 2) * dpr)
    const px = new Uint8Array(4)
    await new Promise<void>((resolve) => {
      const off = onFrame(() => {
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        off()
        resolve()
      }, 11)
    })
    // The pill paints white at `alpha` over the scene; the text sits on that.
    const mix = (c: number) => 255 * alpha + c * (1 - alpha)
    const bg = lum(mix(px[0]!), mix(px[1]!), mix(px[2]!))
    const crimson = lum(0xb3, 0x20, 0x2a)
    const [hi, lo] = bg > crimson ? [bg, crimson] : [crimson, bg]
    out.push({
      beat: i + 1,
      behind: `rgb(${px[0]}, ${px[1]}, ${px[2]})`,
      composited: `rgb(${Math.round(mix(px[0]!))}, ${Math.round(mix(px[1]!))}, ${Math.round(mix(px[2]!))})`,
      ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2),
    })
  }
  return out
}
