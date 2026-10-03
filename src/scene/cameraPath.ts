// The camera's route, precomputed once into a table so each frame is a lookup.

import { CatmullRomCurve3, Vector3 } from 'three'
import { clamp } from '../lib/math'
import {
  CAMERA_CLEARANCE,
  CAMERA_FOOTPRINT,
  CAMERA_PATH,
  CAMERA_SMOOTH_T,
  CAMERA_TRACK_SAMPLES,
} from './config'
import { groundCeiling } from './terrain.ts'

export interface CameraTrack {
  samples: number
  /** xyz per sample: final camera position. */
  pos: Float64Array
  /** xyz per sample: look target. */
  look: Float64Array
  /** Per sample: the lowest allowed camera y (ground ceiling + clearance). */
  floor: Float64Array
  /** Per sample: the raw spline y before clamping, for the debug HUD and tests. */
  rawY: Float64Array
}

let track: CameraTrack | null = null

/** Running max over a window of +-r samples. */
function dilate(src: Float64Array, r: number): Float64Array {
  const out = new Float64Array(src.length)
  for (let i = 0; i < src.length; i++) {
    let m = -Infinity
    for (let k = Math.max(0, i - r); k <= Math.min(src.length - 1, i + r); k++) m = Math.max(m, src[k]!)
    out[i] = m
  }
  return out
}

/** Box blur over +-r samples, edges clamped. */
function boxBlur(src: Float64Array, r: number): Float64Array {
  const out = new Float64Array(src.length)
  const last = src.length - 1
  for (let i = 0; i < src.length; i++) {
    let sum = 0
    for (let k = i - r; k <= i + r; k++) sum += src[clamp(k, 0, last)]!
    out[i] = sum / (2 * r + 1)
  }
  return out
}

/**
 * Build the track:
 *   1. sample both centripetal Catmull-Rom curves (waypoint i sits at t = i / (n - 1))
 *   2. clamp: y >= highest ground within CAMERA_FOOTPRINT + CAMERA_CLEARANCE, then a
 *      running max over t so the camera only ever rises
 *   3. lift = clamped - spline. Dilate the lift by 2r, then box-blur it twice by r. The
 *      result is smooth and never below the original lift (every blurred sample averages
 *      values that are all >= it), so the clamp shows no kink and is never undercut.
 *      Where the terrain is clear the lift is 0 and the authored spline is used as is.
 *   4. a final running max, in case the smoothed lift fades faster than the spline climbs
 */
function buildTrack(): CameraTrack {
  const S = CAMERA_TRACK_SAMPLES
  const posCurve = new CatmullRomCurve3(
    CAMERA_PATH.map((w) => new Vector3(...w.pos)),
    false,
    'centripetal',
  )
  const lookCurve = new CatmullRomCurve3(
    CAMERA_PATH.map((w) => new Vector3(...w.look)),
    false,
    'centripetal',
  )

  const pos = new Float64Array(S * 3)
  const look = new Float64Array(S * 3)
  const floor = new Float64Array(S)
  const rawY = new Float64Array(S)
  const lift = new Float64Array(S)
  const p = new Vector3()

  let clamped = -Infinity
  for (let i = 0; i < S; i++) {
    const u = i / (S - 1)
    posCurve.getPoint(u, p)
    pos[i * 3] = p.x
    pos[i * 3 + 2] = p.z
    rawY[i] = p.y
    floor[i] = groundCeiling(p.x, p.z, CAMERA_FOOTPRINT) + CAMERA_CLEARANCE
    clamped = Math.max(clamped, p.y, floor[i]!)
    lift[i] = clamped - p.y
    lookCurve.getPoint(u, p)
    look[i * 3] = p.x
    look[i * 3 + 1] = p.y
    look[i * 3 + 2] = p.z
  }

  const r = Math.max(1, Math.round(CAMERA_SMOOTH_T * (S - 1)))
  const smoothLift = boxBlur(boxBlur(dilate(lift, 2 * r), r), r)
  let y = -Infinity
  for (let i = 0; i < S; i++) {
    y = Math.max(y, rawY[i]! + smoothLift[i]!)
    pos[i * 3 + 1] = y
  }

  return { samples: S, pos, look, floor, rawY }
}

export function getCameraTrack(): CameraTrack {
  return (track ??= buildTrack())
}

/** Camera position and look target at eased progress t (linear between table samples). */
export function sampleCameraPath(t: number, outPos: Vector3, outLook: Vector3): void {
  const tr = getCameraTrack()
  const u = clamp(t, 0, 1) * (tr.samples - 1)
  const i = Math.min(Math.floor(u), tr.samples - 2)
  const f = u - i
  const a = i * 3
  const b = a + 3
  const P = tr.pos
  const L = tr.look
  outPos.set(P[a]! + (P[b]! - P[a]!) * f, P[a + 1]! + (P[b + 1]! - P[a + 1]!) * f, P[a + 2]! + (P[b + 2]! - P[a + 2]!) * f)
  outLook.set(L[a]! + (L[b]! - L[a]!) * f, L[a + 1]! + (L[b + 1]! - L[a + 1]!) * f, L[a + 2]! + (L[b + 2]! - L[a + 2]!) * f)
}
