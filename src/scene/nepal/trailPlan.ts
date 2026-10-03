// The stone trail: flat slabs draped over the ground along the camera's own track, from the
// valley up to just below the cloud base. Built once; pure and deterministic.

import { Vector3 } from 'three'
import { sampleCameraPath } from '../cameraPath'
import { mulberry32 } from '../noise'
import { groundNormal, groundY } from './anchors'
import { HALF_DENSITY, TRAIL, TRAIL_COLORS, TRAIL_MOBILE_PITCH, TRAIL_MOBILE_SCALE } from './config'

export interface PlacedStone {
  position: Vector3
  /** Ground normal the slab lies on. */
  normal: Vector3
  /** Direction of travel along the trail, already perpendicular to the normal. */
  forward: Vector3
  scale: Vector3
  /** Index into TRAIL_COLORS. */
  color: number
}

export interface TrailPlan {
  slabs: PlacedStone[]
  edges: PlacedStone[]
  /** Trail center line on the ground: other features keep their distance from this. */
  center: Vector3[]
}

/** The camera's ground track over a t range, resampled at even arc length in plan. */
function groundTrack(t0: number, t1: number, step: number): { point: Vector3; forward: Vector3 }[] {
  const pos = new Vector3()
  const look = new Vector3()
  const raw: Vector3[] = []
  for (let t = t0; t <= t1 + 1e-9; t += 0.0015) {
    sampleCameraPath(t, pos, look)
    raw.push(new Vector3(pos.x, 0, pos.z))
  }

  const out: { point: Vector3; forward: Vector3 }[] = []
  let carry = 0
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1]!
    const b = raw[i]!
    const seg = a.distanceTo(b)
    if (seg < 1e-6) continue
    const forward = new Vector3().subVectors(b, a).divideScalar(seg)
    for (let s = carry; s < seg; s += step) {
      out.push({ point: new Vector3().lerpVectors(a, b, s / seg), forward: forward.clone() })
    }
    carry = (carry - seg) % step
    if (carry < 0) carry += step
  }
  return out
}

function place(
  x: number,
  z: number,
  forward: Vector3,
  scale: Vector3,
  color: number,
  sink: number,
  tilt?: { a: number; b: number },
): PlacedStone {
  const normal = groundNormal(x, z, new Vector3())
  if (tilt) {
    // Tip the slab off the ground plane by a few degrees. A trodden-in stone is never
    // perfectly flush, and a path of perfectly flush ones reads as tiling.
    normal.x += tilt.a
    normal.z += tilt.b
    normal.normalize()
  }
  // Keep the travel direction in the ground plane so the slab lies flat on the slope.
  const flat = forward.clone().addScaledVector(normal, -forward.dot(normal)).normalize()
  return { position: new Vector3(x, groundY(x, z) - sink, z), normal, forward: flat, scale, color }
}

export function buildTrailPlan(): TrailPlan {
  const rand = mulberry32(4242)
  const pitch = TRAIL.pitch * (HALF_DENSITY ? TRAIL_MOBILE_PITCH : 1)
  const sizeScale = HALF_DENSITY ? TRAIL_MOBILE_SCALE : 1
  const track = groundTrack(TRAIL.t[0], TRAIL.t[1], pitch)

  const slabs: PlacedStone[] = []
  const edges: PlacedStone[] = []
  const center: Vector3[] = []
  const right = new Vector3()
  const yawAxis = new Vector3()

  for (let i = 0; i < track.length; i++) {
    const node = track[i]!
    const s = i * pitch
    right.set(-node.forward.z, 0, node.forward.x)
    // A slow wander across the camera's track, so the trail reads as a path, not a rail.
    const offset = TRAIL.offset + TRAIL.meanderAmp * Math.sin((s / TRAIL.meanderLength) * Math.PI * 2)
    const jitter = (rand() * 2 - 1) * TRAIL.lateralJitter
    const x = node.point.x + right.x * (offset + jitter)
    const z = node.point.z + right.z * (offset + jitter)

    const scale = new Vector3(
      TRAIL.slab[0] * sizeScale * (1 + (rand() * 2 - 1) * TRAIL.scaleJitter),
      TRAIL.slab[1] * (1 + (rand() * 2 - 1) * TRAIL.scaleJitter),
      TRAIL.slab[2] * sizeScale * (1 + (rand() * 2 - 1) * TRAIL.scaleJitter),
    )
    // Stop where the ground reaches the cloud: the trail never climbs into the whiteout.
    if (groundY(x, z) > TRAIL.maxY) break
    const tiltMax = Math.tan((TRAIL.tiltJitter * Math.PI) / 180)
    const stone = place(x, z, node.forward, scale, Math.floor(rand() * TRAIL_COLORS.length), TRAIL.sink, {
      a: (rand() * 2 - 1) * tiltMax,
      b: (rand() * 2 - 1) * tiltMax,
    })
    // Random turn about the ground normal, so no two slabs line up exactly.
    stone.forward.applyAxisAngle(
      yawAxis.copy(stone.normal),
      ((rand() * 2 - 1) * TRAIL.yawJitter * Math.PI) / 180,
    )
    slabs.push(stone)
    center.push(new Vector3(x, stone.position.y, z))

    if (i % TRAIL.edgeEvery === 0) {
      const side = i % (TRAIL.edgeEvery * 2) === 0 ? 1 : -1
      const away = scale.x / 2 + TRAIL.edgeSpread + rand() * 0.4
      const ex = x + right.x * away * side
      const ez = z + right.z * away * side
      const r = TRAIL.edgeSize * sizeScale * (0.75 + rand() * 0.7)
      edges.push(
        place(ex, ez, node.forward, new Vector3(r, r * (0.6 + rand() * 0.5), r), Math.floor(rand() * TRAIL_COLORS.length), r * 0.45),
      )
    }
  }

  return { slabs, edges, center }
}

let cached: TrailPlan | null = null

export function getTrailPlan(): TrailPlan {
  return (cached ??= buildTrailPlan())
}
