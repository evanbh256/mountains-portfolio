// Placement helpers. Everything is composed relative to the camera track and snapped to
// the rendered ground, so props follow the scene if the path or terrain is retuned.
// Build-time only: these allocate freely and are never called per frame.

import { Vector3 } from 'three'
import { atmosphereAt } from '../atmosphere'
import { sampleCameraPath } from '../cameraPath'
import { BEAT_COUNT, CAMERA_FOV, TEXT_BEAT_COUNT } from '../config'
import { surfaceHeightAt } from '../terrain.ts'

export interface AnchorOffset {
  /** Along the camera's horizontal right vector. */
  right?: number
  /** Along the camera's horizontal forward vector. */
  ahead?: number
  /** Up from the camera, or from the ground when snapped. */
  up?: number
}

const pos = new Vector3()
const look = new Vector3()

/** Horizontal forward and right unit vectors of the camera track at t. */
export function cameraFrameAtT(t: number): { pos: Vector3; forward: Vector3; right: Vector3 } {
  sampleCameraPath(t, pos, look)
  const forward = new Vector3(look.x - pos.x, 0, look.z - pos.z).normalize()
  const right = new Vector3(-forward.z, 0, forward.x)
  return { pos: pos.clone(), forward, right }
}

/**
 * World position offset from the camera pose at eased progress t. With `snap`, y is the
 * rendered ground height at that point plus `up`; otherwise it is the camera's y plus `up`.
 */
export function anchorAtT(t: number, offset: AnchorOffset, snap = false): Vector3 {
  const { pos: p, forward, right } = cameraFrameAtT(t)
  const out = p.addScaledVector(right, offset.right ?? 0).addScaledVector(forward, offset.ahead ?? 0)
  out.y = (snap ? surfaceHeightAt(out.x, out.z) : out.y) + (offset.up ?? 0)
  return out
}

/** Rendered ground height; the mesh surface, not the continuous field, so nothing floats. */
export const groundY = surfaceHeightAt

/** Lowest rendered ground within `radius` of (x, z): where a post or plinth must reach down to. */
export function groundFloor(x: number, z: number, radius: number): number {
  let low = surfaceHeightAt(x, z)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    low = Math.min(low, surfaceHeightAt(x + radius * Math.cos(a), z + radius * Math.sin(a)))
  }
  return low
}

/** Highest rendered ground within `radius` of (x, z). */
export function groundTop(x: number, z: number, radius: number): number {
  let top = surfaceHeightAt(x, z)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    top = Math.max(top, surfaceHeightAt(x + radius * Math.cos(a), z + radius * Math.sin(a)))
  }
  return top
}

/** Ground normal from central differences of the rendered surface. */
export function groundNormal(x: number, z: number, out: Vector3, eps = 0.6): Vector3 {
  const dx = surfaceHeightAt(x + eps, z) - surfaceHeightAt(x - eps, z)
  const dz = surfaceHeightAt(x, z + eps) - surfaceHeightAt(x, z - eps)
  return out.set(-dx / (2 * eps), 1, -dz / (2 * eps)).normalize()
}

/**
 * A cord hung between a and b, sampled as a polyline. The sag profile is a catenary
 * (cosh) normalized so the midpoint hangs exactly `sag` below the straight chord.
 */
export function catenary(a: Vector3, b: Vector3, sag: number, samples = 48, shape = 1.2): Vector3[] {
  const coshC = Math.cosh(shape)
  const points: Vector3[] = []
  for (let i = 0; i <= samples; i++) {
    const u = i / samples
    const drop = (Math.cosh(shape * (2 * u - 1)) - coshC) / (coshC - 1) // 0 at the ends, -1 mid
    points.push(new Vector3().lerpVectors(a, b, u).setY(a.y + (b.y - a.y) * u + sag * drop))
  }
  return points
}

export interface PolylineSampler {
  length: number
  /** Point and unit tangent at arc length s. */
  at(s: number, outPoint: Vector3, outTangent: Vector3): void
}

/** Arc-length parametrization of a polyline. */
export function polylineSampler(points: Vector3[]): PolylineSampler {
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1]! + points[i]!.distanceTo(points[i - 1]!))
  const length = cumulative[cumulative.length - 1]!
  return {
    length,
    at(s, outPoint, outTangent) {
      let i = 1
      while (i < cumulative.length - 1 && cumulative[i]! < s) i++
      const a = points[i - 1]!
      const b = points[i]!
      const seg = cumulative[i]! - cumulative[i - 1]!
      const f = seg > 0 ? (s - cumulative[i - 1]!) / seg : 0
      outPoint.lerpVectors(a, b, Math.min(Math.max(f, 0), 1))
      outTangent.subVectors(b, a).normalize()
    },
  }
}

/* ------------------------------------------------------------------ */
/* Framing                                                             */
/* ------------------------------------------------------------------ */

const TAN_HALF_FOV = Math.tan((CAMERA_FOV / 2) * (Math.PI / 180))
const sp = new Vector3()
const sl = new Vector3()
const sr = new Vector3()
const su = new Vector3()
const sd = new Vector3()

export interface ScreenPoint {
  /** Percent from the left and top of the frame. */
  sx: number
  sy: number
  /** View depth (negative = behind the camera). */
  depth: number
}

/** Where a world point lands on screen from the camera pose at t, for a given aspect. */
export function screenAt(t: number, point: Vector3, aspect: number, out: ScreenPoint): ScreenPoint {
  sampleCameraPath(t, sp, sl)
  sd.subVectors(sl, sp).normalize()
  sr.set(-sd.z, 0, sd.x).normalize()
  su.crossVectors(sr, sd)
  const d = sl.subVectors(point, sp) // sl is free again
  const depth = d.dot(sd)
  out.depth = depth
  out.sx = 50 + (50 * d.dot(sr)) / (depth * TAN_HALF_FOV * aspect)
  out.sy = 50 - (50 * d.dot(su)) / (depth * TAN_HALF_FOV)
  return out
}

/** The beat text block: the bottom-left of the frame, kept clear of bright props. */
export const TEXT_ZONE = { width: 40, height: 35 }

const shot: ScreenPoint = { sx: 0, sy: 0, depth: 0 }

/**
 * True if a point falls in the text zone at beat t, on either common desktop shape. A point
 * has to be on screen to count: behind or beside the camera, or too deep in the fog to
 * read, it does not (off-screen points project far outside the frame, not into the corner).
 */
export function inTextZoneAt(t: number, point: Vector3, maxDepth = 90): boolean {
  for (const aspect of [4 / 3, 16 / 9]) {
    screenAt(t, point, aspect, shot)
    if (shot.depth <= 2 || shot.depth > maxDepth) continue
    const onScreen = shot.sx >= 0 && shot.sx <= 100 && shot.sy >= 0 && shot.sy <= 100
    if (onScreen && shot.sx < TEXT_ZONE.width && shot.sy > 100 - TEXT_ZONE.height) return true
  }
  return false
}

/* ------------------------------------------------------------------ */
/* Keeping trees out from behind the copy                              */
/* ------------------------------------------------------------------ */

export interface CopyZone {
  aspect: number
  /** The copy's right edge, percent across. It starts at the left edge of the frame. */
  x1: number
  /** Per text beat, the copy's top, percent down. It runs to the bottom of the frame. */
  y0: number[]
}

/**
 * Where each climb beat's copy is, per frame shape, for keeping trees out from behind it.
 *
 * Measured, not estimated: `tools/ui-audit/copyzone.mjs` reads each beat's rendered text,
 * line by line, plus its pill, at 1024x768, 1132x764, 1280x800, 1440x900, 1366x768 and
 * 1920x1080, allows for the 24px the block slides as it fades in and out, and adds 2.5% of
 * clear space. Re-run it after any change to the type scale and paste its output here.
 *
 * TEXT_ZONE above is smaller and is still what ground cover is kept out of. A tree is the
 * one prop tall and dark enough to read as sitting behind the words, so it is held to the
 * copy's real footprint.
 */
export const COPY_ZONES: CopyZone[] = [
  { aspect: 4 / 3, x1: 45.4, y0: [52.3, 53.4, 61.9, 56.8] },
  { aspect: 1132 / 764, x1: 42.4, y0: [51.4, 52.8, 61.5, 52.8] },
  { aspect: 1.6, x1: 39, y0: [52.6, 54.3, 62.9, 54.3] },
  { aspect: 16 / 9, x1: 37.4, y0: [50.3, 52.2, 61.2, 52.2] },
]

/** Samples per beat window. A tree crossing the zone does so over ~5% of t at most. */
const COPY_STEPS = 40

/** Past this fog factor a prop is mist, not a tree behind the text. */
const COPY_FOG_CUTOFF = 0.93

export interface Silhouette {
  /** Points along a thin part: a trunk, a pole, a cord. */
  points: Vector3[]
  /** Spheres that bound a bulky part: a canopy with its blossoms, a flag. */
  spheres: { center: Vector3; radius: number }[]
}


const probe: ScreenPoint = { sx: 0, sy: 0, depth: 0 }

/**
 * Does any part of a prop pass behind the copy while the copy is on screen?
 *
 * The rule this replaces tested one point - the crown's centre - at one moment - each
 * beat's midpoint - against a zone a third smaller than the copy. A tree could pass it and
 * still stand behind the Hello pill a few hundred pixels of scroll later, which is what the
 * left-hand conifers did: below the valley the camera flies above the ground, so anything
 * on the left drifts down and outward through the copy's corner as the camera closes in.
 *
 * This sweeps every text beat's whole visible window instead, on four frame shapes, and
 * tests the thin parts and the projected extent of the bulky ones - not their centres -
 * against the copy's measured footprint. Trees, poles, cords and flags all go through it.
 * Returns why it fails, or null.
 */
export function behindCopy(tree: Silhouette): string | null {
  for (let beat = 0; beat < TEXT_BEAT_COUNT; beat++) {
    // Copy is on screen for the beat's whole window, apart from the ends of its fades.
    const t0 = beat === 0 ? 0 : beat / BEAT_COUNT + 0.008
    const t1 = (beat + 1) / BEAT_COUNT - 0.008
    for (let k = 0; k <= COPY_STEPS; k++) {
      const t = t0 + ((t1 - t0) * k) / COPY_STEPS
      const density = atmosphereAt(t).density
      const maxDepth = Math.sqrt(-Math.log(1 - COPY_FOG_CUTOFF)) / density
      for (const zone of COPY_ZONES) {
        const { aspect, x1 } = zone
        const y0 = zone.y0[beat]!
        for (const s of tree.spheres) {
          screenAt(t, s.center, aspect, probe)
          if (probe.depth <= 1 || probe.depth > maxDepth) continue
          // The sphere's extent on screen, in percent of each axis, against the nearest
          // point of the copy's rectangle (which runs to the left and bottom edges).
          const ry = (50 * s.radius) / (probe.depth * TAN_HALF_FOV)
          const rx = ry / aspect
          const cx = Math.min(Math.max(probe.sx, 0), x1)
          const cy = Math.min(Math.max(probe.sy, y0), 100)
          if (((cx - probe.sx) / rx) ** 2 + ((cy - probe.sy) / ry) ** 2 <= 1) {
            return `behind beat ${beat} copy at t=${t.toFixed(3)}, ${aspect.toFixed(2)}:1`
          }
        }
        for (const pt of tree.points) {
          screenAt(t, pt, aspect, probe)
          if (probe.depth <= 1 || probe.depth > maxDepth) continue
          if (probe.sx >= 0 && probe.sx <= x1 && probe.sy >= y0 && probe.sy <= 100) {
            return `behind beat ${beat} copy at t=${t.toFixed(3)}, ${aspect.toFixed(2)}:1`
          }
        }
      }
    }
  }
  return null
}
