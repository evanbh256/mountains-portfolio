// Where every blade of grass stands. Built once, deterministically, from the same terrain
// functions the mesh is built from, so nothing ever floats or sinks.
//
// Blades are placed in tufts in a band along the route the camera climbs: that is where the
// stone trail runs and the only ground the camera ever gets near. Density falls off across
// the band, stops short of the trail itself, and stops altogether on steep rock or above the
// snow line. The field is handed back in chunks along the route so each can be frustum-
// culled on its own.

import { Vector3 } from 'three'
import { IS_LOW } from '../lib/quality'
import { clamp, lerp, smoothstep } from '../lib/math'
import { sampleCameraPath } from './cameraPath'
import { GRASS } from './config'
import { createNoise2D, mulberry32 } from './noise'
import { surfaceHeightAt, surfaceSlopeAt } from './terrain.ts'

export interface GrassChunk {
  /** x, y, z per blade. */
  positions: Float32Array
  /** yaw, height, tint per blade. */
  blades: Float32Array
  count: number
}

/** The camera's ground track, resampled evenly in plan with its tangent. */
export function routeSamples(steps: number): { x: number; z: number; tx: number; tz: number }[] {
  const pos = new Vector3()
  const look = new Vector3()
  const out: { x: number; z: number; tx: number; tz: number }[] = []
  // Only the part below the snow line is worth planting; the camera is inside cloud above it.
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 0.62
    sampleCameraPath(t, pos, look)
    out.push({ x: pos.x, z: pos.z, tx: 0, tz: 0 })
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)]!
    const b = out[Math.min(out.length - 1, i + 1)]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz) || 1
    out[i]!.tx = dx / len
    out[i]!.tz = dz / len
  }
  return out
}

/**
 * Plant the field. One pass: pick a tuft center along the route, reject it if the ground
 * there cannot hold grass, then scatter a few blades around it.
 */
export function buildGrassPlan(): GrassChunk[] {
  const target = Math.round(GRASS.COUNT * (IS_LOW ? GRASS.LOW_SCALE : 1))
  const route = routeSamples(220)
  const rand = mulberry32(4271)
  const patchNoise = createNoise2D(4272)
  const chunks: GrassChunk[] = []

  const perChunk = Math.ceil(target / GRASS.CHUNKS)
  for (let c = 0; c < GRASS.CHUNKS; c++) {
    const positions = new Float32Array(perChunk * 3)
    const blades = new Float32Array(perChunk * 3)
    let n = 0
    // Each chunk owns a stretch of the route, so its blades share a small bounding sphere.
    const from = (c / GRASS.CHUNKS) * (route.length - 1)
    const to = ((c + 1) / GRASS.CHUNKS) * (route.length - 1)

    let guard = 0
    while (n < perChunk && guard++ < perChunk * 60) {
      const s = route[Math.floor(lerp(from, to, rand()))]!
      // Across the route: biased toward the trail, never on it.
      const side = rand() < 0.5 ? -1 : 1
      const across = GRASS.TRAIL_CLEAR + Math.pow(rand(), GRASS.BAND_FALLOFF) * (GRASS.BAND - GRASS.TRAIL_CLEAR)
      const x = s.x - s.tz * across * side
      const z = s.z + s.tx * across * side

      const y = surfaceHeightAt(x, z)
      if (y > GRASS.MAX_Y) continue
      const slope = surfaceSlopeAt(x, z)
      if (slope > GRASS.MAX_SLOPE) continue
      // Thinner as the ground steepens and as the air gets thin, and patchy throughout:
      // alpine grass grows in beds, so a field of even density reads as a lawn.
      const patch = 1 - GRASS.PATCH_DEPTH * (0.5 + 0.5 * patchNoise(x / GRASS.PATCH_SCALE, z / GRASS.PATCH_SCALE))
      const thinning =
        (1 - 0.8 * smoothstep(GRASS.MAX_SLOPE * 0.55, GRASS.MAX_SLOPE, slope)) *
        (1 - smoothstep(GRASS.MAX_Y - 14, GRASS.MAX_Y, y)) *
        patch
      if (rand() > thinning) continue

      const tuft = Math.min(perChunk - n, Math.round(lerp(GRASS.TUFT[0], GRASS.TUFT[1], rand())))
      // The ground under one tuft is a plane to first order: two extra samples give its
      // gradient, and every blade in the tuft is then placed by arithmetic. Sampling the
      // full noise stack per blade instead costs four to nine evaluations per tuft for a
      // height difference of a few centimetres over a 0.6 unit radius.
      const gx = (surfaceHeightAt(x + GRASS.TUFT_RADIUS, z) - y) / GRASS.TUFT_RADIUS
      const gz = (surfaceHeightAt(x, z + GRASS.TUFT_RADIUS) - y) / GRASS.TUFT_RADIUS
      for (let b = 0; b < tuft; b++) {
        const a = rand() * Math.PI * 2
        const r = Math.sqrt(rand()) * GRASS.TUFT_RADIUS
        const dx = Math.cos(a) * r
        const dz = Math.sin(a) * r
        const bx = x + dx
        const bz = z + dz
        positions[n * 3] = bx
        positions[n * 3 + 1] = y + gx * dx + gz * dz - 0.03 // rooted, not hovering
        positions[n * 3 + 2] = bz
        blades[n * 3] = rand() * Math.PI * 2
        blades[n * 3 + 1] = lerp(GRASS.HEIGHT[0], GRASS.HEIGHT[1], rand() * rand() + 0.15)
        // Drier and paler with height, plus per-blade variation.
        blades[n * 3 + 2] = clamp(smoothstep(8, GRASS.MAX_Y, y) * 0.8 + rand() * 0.45, 0, 1)
        n++
      }
    }

    if (n > 0) chunks.push({ positions: positions.subarray(0, n * 3), blades: blades.subarray(0, n * 3), count: n })
  }
  return chunks
}
