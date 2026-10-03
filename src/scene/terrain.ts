// The ground. heightAt() is the single source for the terrain mesh and the camera
// clearance clamp; everything here is deterministic and built once.

import { BufferAttribute, BufferGeometry, Color } from 'three'
import { IS_LOW } from '../lib/quality'
import { clamp, lerp, smoothstep } from '../lib/math'
import {
  AO_MIN,
  AO_RADIUS,
  AO_RANGE,
  BROAD_AMP,
  BROAD_FREQ,
  BROAD_OCTAVES,
  CAMERA_PATH,
  DETAIL_BASE,
  DETAIL_MEAN,
  DETAIL_SCALE,
  DISTANT_PEAKS,
  MASSIF_HEIGHT,
  MASSIF_SIGMA,
  MASSIF_X,
  MASSIF_Z,
  PEAK_SHARPNESS,
  RIDGE_FREQ,
  RIDGE_GAIN,
  RIDGE_LACUNARITY,
  RIDGE_OCTAVES,
  SUMMIT_CAP,
  TERRAIN_BANDS,
  TERRAIN_CENTER_X,
  TERRAIN_CENTER_Z,
  TERRAIN_COLORS,
  TERRAIN_SEED,
  TERRAIN_SEGMENTS_DESKTOP,
  TERRAIN_SEGMENTS_MOBILE,
  TERRAIN_SIZE,
  TRAIL_CORRIDOR,
  TRAIL_CORRIDOR_DETAIL,
  TRAIL_CORRIDOR_TOP,
  VALLEY_FLOOR_Y,
  VALLEY_HALF_WIDTH,
  VALLEY_MEANDER_AMP,
  VALLEY_MEANDER_FREQ,
  VALLEY_ROLL_AMP,
  VALLEY_WALL_END,
  VALLEY_WALL_HEIGHT,
  WARP_AMP,
  WARP_FREQ,
  FAR_RANGES,
} from './config'
import { createNoise2D, mulberry32 } from './noise'

const ridgeNoise = createNoise2D(TERRAIN_SEED)
const lowNoise = createNoise2D(TERRAIN_SEED + 1)
const warpNoise = createNoise2D(TERRAIN_SEED + 2)
const broadNoise = createNoise2D(TERRAIN_SEED + 3)

const TWO_SIGMA_SQ = 2 * MASSIF_SIGMA * MASSIF_SIGMA

// Peak ring converted to world positions once. `reach` skips peaks too far away to matter.
/**
 * Each peak precomputed into the form heightAt needs: its center, and the rotation that
 * takes a world offset into the peak's own frame so `stretch` can draw it out along one
 * axis. A peak is no longer a cone of one shape - it has its own exponent and its own
 * direction, which is what gives the skyline different silhouettes rather than one
 * silhouette repeated.
 */
const PEAKS = DISTANT_PEAKS.map((pk) => {
  const a = (pk.angle * Math.PI) / 180
  const twist = ((pk.twist ?? 0) * Math.PI) / 180
  const stretch = pk.stretch ?? 1
  return {
    x: MASSIF_X + pk.radius * Math.sin(a),
    z: MASSIF_Z - pk.radius * Math.cos(a),
    height: pk.height,
    sigma: pk.sigma,
    sharpness: pk.sharpness ?? PEAK_SHARPNESS,
    cos: Math.cos(twist),
    sin: Math.sin(twist),
    invStretch: 1 / stretch,
    reach: pk.sigma * 4.5 * Math.max(1, stretch),
  }
})

/** Ridged multifractal in [0, 1]: sharp crests where the noise crosses zero. */
function ridged(x: number, z: number): number {
  let sum = 0
  let norm = 0
  let amp = 0.5
  let freq = RIDGE_FREQ
  let weight = 1
  for (let o = 0; o < RIDGE_OCTAVES; o++) {
    let n = 1 - Math.abs(ridgeNoise(x * freq + o * 17.3, z * freq - o * 9.1))
    n *= n
    n *= weight
    weight = clamp(n * 2, 0, 1)
    sum += n * amp
    norm += amp
    amp *= RIDGE_GAIN
    freq *= RIDGE_LACUNARITY
  }
  return sum / norm
}

/** Plain fractal noise in roughly [-1, 1]: the broad swell the ridges sit on. */
function fbm(x: number, z: number): number {
  let sum = 0
  let norm = 0
  let amp = 1
  let freq = BROAD_FREQ
  for (let o = 0; o < BROAD_OCTAVES; o++) {
    sum += amp * broadNoise(x * freq + o * 31.7, z * freq + o * 12.9)
    norm += amp
    amp *= 0.5
    freq *= 2.13
  }
  return sum / norm
}

/* ------------------------------------------------------------------ */
/* Trail corridor                                                      */
/* ------------------------------------------------------------------ */

// The camera's waypoints in plan, as segments. heightAt grades the ground along them, which
// keeps the route walkable, the stone slabs lying flat, and the ground closest to the lens
// quiet. Read straight from CAMERA_PATH rather than from the spline, so this file stays
// free of cameraPath.ts, which depends on it for the clearance clamp.
const ROUTE = CAMERA_PATH.slice(1).map((w, i) => {
  const a = CAMERA_PATH[i]!.pos
  const dx = w.pos[0] - a[0]
  const dz = w.pos[2] - a[2]
  return { x: a[0], z: a[2], dx, dz, lengthSq: dx * dx + dz * dz || 1 }
})

/** Distance in plan from the camera's route. */
function routeDistance(x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i < ROUTE.length; i++) {
    const s = ROUTE[i]!
    const t = clamp(((x - s.x) * s.dx + (z - s.z) * s.dz) / s.lengthSq, 0, 1)
    const ex = x - (s.x + t * s.dx)
    const ez = z - (s.z + t * s.dz)
    const d = ex * ex + ez * ez
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

/**
 * Ground height at (x, z):
 *   massif  - broad Gaussian, peaks near SUMMIT_Y where the camera path ends
 *   valley  - rolling floor near the start, between meandering walls
 *   peaks   - a ring of distant summits, mostly toward -z
 *   detail  - domain-warped ridged noise over a broad swell, stronger on higher ground,
 *             graded back along the trail corridor and left rough above the cloud base
 */
export function heightAt(x: number, z: number): number {
  const mdx = x - MASSIF_X
  const mdz = z - MASSIF_Z
  const m = Math.exp(-(mdx * mdx + mdz * mdz) / TWO_SIGMA_SQ)
  const massif = MASSIF_HEIGHT * m

  const centerX = VALLEY_MEANDER_AMP * Math.sin(z * VALLEY_MEANDER_FREQ)
  const wallShape = 0.75 + 0.5 * lowNoise(x * 0.009, z * 0.009)
  const walls = VALLEY_WALL_HEIGHT * wallShape * smoothstep(VALLEY_HALF_WIDTH, VALLEY_WALL_END, Math.abs(x - centerX))
  const roll =
    VALLEY_FLOOR_Y +
    VALLEY_ROLL_AMP * (1 + 0.6 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038) + 0.4 * Math.sin((x + z) * 0.021 + 0.7))

  let peaks = 0
  for (let i = 0; i < PEAKS.length; i++) {
    const pk = PEAKS[i]!
    const dx = x - pk.x
    const dz = z - pk.z
    if (dx * dx + dz * dz > pk.reach * pk.reach) continue
    // Into the peak's own frame, where its long axis is x, then squash that axis: a
    // stretched peak reads as a massif with shoulders instead of a horn.
    const lx = (dx * pk.cos + dz * pk.sin) * pk.invStretch
    const lz = -dx * pk.sin + dz * pk.cos
    const d = Math.sqrt(lx * lx + lz * lz)
    peaks += pk.height * Math.exp(-Math.pow(d / pk.sigma, pk.sharpness))
  }

  const base = massif + walls + roll * (1 - m) + peaks

  // Ridges curve and fork because the sample point is displaced by a slow noise first.
  const wx = x + WARP_AMP * warpNoise(x * WARP_FREQ, z * WARP_FREQ)
  const wz = z + WARP_AMP * warpNoise(x * WARP_FREQ + 5.7, z * WARP_FREQ - 3.1)

  const m4 = m * m * m * m
  const summitSoftening = 1 - SUMMIT_CAP * m4 * m4 // ~1 except within ~15 units of the top
  const nearRoute = smoothstep(TRAIL_CORRIDOR[0], TRAIL_CORRIDOR[1], routeDistance(x, z))
  const graded = lerp(
    lerp(TRAIL_CORRIDOR_DETAIL, 1, nearRoute),
    1,
    smoothstep(TRAIL_CORRIDOR_TOP[0], TRAIL_CORRIDOR_TOP[1], base),
  )
  const amplitude = (DETAIL_BASE + DETAIL_SCALE * base) * summitSoftening * graded
  return base + amplitude * (ridged(wx, wz) - DETAIL_MEAN) + BROAD_AMP * graded * fbm(x, z)
}

/* ------------------------------------------------------------------ */
/* Sampled grid: exactly what the mesh renders                         */
/* ------------------------------------------------------------------ */

export interface TerrainField {
  segments: number
  step: number
  x0: number
  z0: number
  /** (segments + 1)^2 heights, row-major along x, rows along z. */
  heights: Float32Array
}

let field: TerrainField | null = null

/** heightAt sampled on the mesh grid. Built on first use, then cached. */
export function getTerrainField(): TerrainField {
  if (field) return field
  const segments = IS_LOW ? TERRAIN_SEGMENTS_MOBILE : TERRAIN_SEGMENTS_DESKTOP
  const step = TERRAIN_SIZE / segments
  const x0 = TERRAIN_CENTER_X - TERRAIN_SIZE / 2
  const z0 = TERRAIN_CENTER_Z - TERRAIN_SIZE / 2
  const n = segments + 1
  const heights = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) heights[j * n + i] = heightAt(x0 + i * step, z0 + j * step)
  }
  field = { segments, step, x0, z0, heights }
  return field
}

/**
 * Height of the rendered mesh surface at (x, z): interpolated on the same two
 * triangles per cell that buildTerrainGeometry emits (split along the b-c diagonal).
 */
export function surfaceHeightAt(x: number, z: number): number {
  const f = getTerrainField()
  const n = f.segments + 1
  const gx = clamp((x - f.x0) / f.step, 0, f.segments - 1e-6)
  const gz = clamp((z - f.z0) / f.step, 0, f.segments - 1e-6)
  const i = Math.floor(gx)
  const j = Math.floor(gz)
  const u = gx - i
  const v = gz - j
  const h = f.heights
  const ha = h[j * n + i]!
  const hb = h[j * n + i + 1]!
  const hc = h[(j + 1) * n + i]!
  const hd = h[(j + 1) * n + i + 1]!
  return u + v <= 1 ? ha + u * (hb - ha) + v * (hc - ha) : hd + (1 - u) * (hc - hd) + (1 - v) * (hb - hd)
}

/** Steepness (1 - normal.y) of the rendered surface at (x, z), from central differences. */
export function surfaceSlopeAt(x: number, z: number, eps = 1): number {
  const dx = surfaceHeightAt(x + eps, z) - surfaceHeightAt(x - eps, z)
  const dz = surfaceHeightAt(x, z + eps) - surfaceHeightAt(x, z - eps)
  return 1 - (2 * eps) / Math.sqrt(dx * dx + dz * dz + 4 * eps * eps)
}

const RING = 8

/**
 * Highest ground within `radius` of (x, z): the center plus two rings of samples, each
 * the max of the continuous heightAt and the rendered mesh surface.
 */
export function groundCeiling(x: number, z: number, radius: number): number {
  let top = Math.max(heightAt(x, z), surfaceHeightAt(x, z))
  for (let r = 1; r <= 2; r++) {
    const rr = (radius * r) / 2
    for (let k = 0; k < RING; k++) {
      const a = ((k + r * 0.5) / RING) * Math.PI * 2
      const sx = x + rr * Math.cos(a)
      const sz = z + rr * Math.sin(a)
      top = Math.max(top, heightAt(sx, sz), surfaceHeightAt(sx, sz))
    }
  }
  return top
}

/* ------------------------------------------------------------------ */
/* Sky occlusion                                                       */
/* ------------------------------------------------------------------ */

const clampIndex = (v: number, n: number) => (v < 0 ? 0 : v > n - 1 ? n - 1 : v)

/**
 * One box-blur pass over the grid, along x when `stride` is 1 and along z when it is n.
 * A running sum keeps it one add and one subtract per point whatever the radius.
 */
function boxBlur(src: Float32Array, dst: Float32Array, n: number, r: number, stride: number): void {
  const step = stride === 1 ? n : 1 // start of each line
  const width = 2 * r + 1
  for (let line = 0; line < n; line++) {
    const base = line * step
    let sum = 0
    for (let k = -r; k <= r; k++) sum += src[base + clampIndex(k, n) * stride]!
    for (let i = 0; i < n; i++) {
      dst[base + i * stride] = sum / width
      sum += src[base + clampIndex(i + r + 1, n) * stride]! - src[base + clampIndex(i - r, n) * stride]!
    }
  }
}

/**
 * How much sky each grid point sees, as a multiplier on indirect light. Ground that sits
 * below the height typical around it is in a hollow and sees less of the sky; anything
 * standing proud of it sees all of it. Two blur passes over the grid, once, at startup.
 *
 * "Typical" is the terrain's own mean drop, not zero: ridged noise spends more of its area
 * in broad hollows than on narrow crests, so measuring against zero would shade the whole
 * mountain down. This is contrast between gully and ridge; the schedule sets the level.
 */
function opennessField(f: TerrainField): Float32Array {
  const n = f.segments + 1
  const radius = Math.max(1, Math.round(AO_RADIUS / f.step))
  const rows = new Float32Array(n * n)
  const blurred = new Float32Array(n * n)
  boxBlur(f.heights, rows, n, radius, 1)
  boxBlur(rows, blurred, n, radius, n)

  const openness = new Float32Array(n * n)
  let mean = 0
  for (let k = 0; k < openness.length; k++) {
    openness[k] = f.heights[k]! - blurred[k]!
    mean += openness[k]!
  }
  mean /= openness.length
  for (let k = 0; k < openness.length; k++) {
    openness[k] = lerp(AO_MIN, 1, smoothstep(-AO_RANGE, 0, openness[k]! - mean))
  }
  return openness
}

/* ------------------------------------------------------------------ */
/* Mesh                                                                */
/* ------------------------------------------------------------------ */

/** Indexed grid geometry with height/slope vertex colors. Normals feed the slope term. */
export function buildTerrainGeometry(): BufferGeometry {
  const f = getTerrainField()
  const n = f.segments + 1
  const positions = new Float32Array(n * n * 3)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3
      positions[k] = f.x0 + i * f.step
      positions[k + 1] = f.heights[j * n + i]!
      positions[k + 2] = f.z0 + j * f.step
    }
  }

  // Two up-facing triangles per cell: (a, c, b) and (b, c, d), split along b-c.
  const index = new Uint32Array(f.segments * f.segments * 6)
  let w = 0
  for (let j = 0; j < f.segments; j++) {
    for (let i = 0; i < f.segments; i++) {
      const a = j * n + i
      const b = a + 1
      const c = a + n
      const d = c + 1
      index[w++] = a
      index[w++] = c
      index[w++] = b
      index[w++] = b
      index[w++] = c
      index[w++] = d
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  geometry.computeVertexNormals()
  geometry.setAttribute('color', new BufferAttribute(terrainColors(positions, geometry), 3))
  geometry.setAttribute('aOpenness', new BufferAttribute(opennessField(f), 1))
  geometry.computeBoundingSphere()
  return geometry
}

const valleyColor = new Color(TERRAIN_COLORS.valley)
const meadowColor = new Color(TERRAIN_COLORS.meadow)
const rockColor = new Color(TERRAIN_COLORS.rock)
const slateColor = new Color(TERRAIN_COLORS.slate)
const paleColor = new Color(TERRAIN_COLORS.paleRock)
const snowColor = new Color(TERRAIN_COLORS.snow)
const bare = new Color()

/**
 * Surface color at a point: ground cover on gentle ground, bare rock on steep faces, both
 * cooling and paling with height, snow on top. Band edges are jittered by noise so they
 * never read as contour lines. The fragment shader adds strata, grain and drifted snow.
 */
export function colorAt(out: Color, x: number, y: number, z: number, slope: number): Color {
  const B = TERRAIN_BANDS
  const h = y + lowNoise(x * 0.06, z * 0.06) * B.jitter

  // Ground cover: wet valley green drying to olive as it climbs.
  out.copy(valleyColor).lerp(meadowColor, smoothstep(B.meadow[0], B.meadow[1], h))
  // Bare rock: warm brown low down, slate higher, pale above that.
  bare.copy(rockColor).lerp(slateColor, smoothstep(B.slate[0], B.slate[1], h))
  bare.lerp(paleColor, smoothstep(B.paleRock[0], B.paleRock[1], h))
  out.lerp(bare, smoothstep(B.steep[0], B.steep[1], slope))
  out.lerp(snowColor, smoothstep(B.snow[0], B.snow[1], h) * (1 - smoothstep(B.snowSlope[0], B.snowSlope[1], slope)))
  return out
}

function terrainColors(positions: Float32Array, geometry: BufferGeometry): Float32Array {
  const normals = geometry.getAttribute('normal')
  const colors = new Float32Array(positions.length)
  const c = new Color()

  for (let v = 0; v < positions.length / 3; v++) {
    colorAt(c, positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!, 1 - normals.getY(v))
    colors[v * 3] = c.r
    colors[v * 3 + 1] = c.g
    colors[v * 3 + 2] = c.b
  }
  return colors
}

/* ------------------------------------------------------------------ */
/* Far ranges                                                          */
/* ------------------------------------------------------------------ */

/**
 * One band of horizon peaks, as a polar grid around the massif: a spine with summits on it,
 * tapered to nothing at the band's inner and outer edges so it reads as a range standing in
 * the cloud sea rather than a strip of floating geometry. What is left below the cloud floor
 * is hidden under it, and from the valley the fog closes long before this far out.
 */
export interface FarPeak {
  /** Radians from -z, positive toward +x. */
  angle: number
  radius: number
  height: number
  sigma: number
  x: number
  z: number
}

const farPeaks = new Map<number, FarPeak[]>()

/** The summits of one FAR_RANGES band. Built once; the mesh and the snow plume share them. */
export function farRangePeaks(index: number): FarPeak[] {
  const cached = farPeaks.get(index)
  if (cached) return cached
  const range = FAR_RANGES[index]!
  const rand = mulberry32(range.seed)
  const peaks = Array.from({ length: range.peaks }, () => {
    const angle = (rand() * 2 - 1) * Math.PI
    // The tall ones favour the summit's view direction (-z is angle 0).
    const grand = Math.pow(Math.cos(angle / 2), 2)
    const radius = range.radius + (rand() - 0.5) * range.band * 0.45
    return {
      angle,
      radius,
      height: lerp(range.height[0], range.height[1], 0.35 * rand() + 0.65 * grand),
      sigma: lerp(range.sigma[0], range.sigma[1], rand()),
      x: MASSIF_X + radius * Math.sin(angle),
      z: MASSIF_Z - radius * Math.cos(angle),
    }
  })
  farPeaks.set(index, peaks)
  return peaks
}

export function buildFarRangeGeometry(rangeIndex: number): BufferGeometry {
  const range = FAR_RANGES[rangeIndex]!
  const detail = createNoise2D(range.seed + 101)
  const peaks = farRangePeaks(rangeIndex)

  const { angles, rings } = range
  const count = angles * (rings + 1)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const c = new Color()
  let k = 0

  for (let r = 0; r <= rings; r++) {
    const across = r / rings
    const radius = range.radius - range.band / 2 + range.band * across
    const taper = Math.pow(Math.sin(across * Math.PI), 1.7) // nothing left at either edge
    for (let a = 0; a < angles; a++) {
      const angle = (a / angles) * Math.PI * 2 - Math.PI
      const x = MASSIF_X + radius * Math.sin(angle)
      const z = MASSIF_Z - radius * Math.cos(angle)

      let height = 0
      for (const pk of peaks) {
        let da = angle - pk.angle
        if (da > Math.PI) da -= 2 * Math.PI
        if (da < -Math.PI) da += 2 * Math.PI
        // Angular distance as an arc length, so a peak keeps its width all the way round.
        const d = Math.hypot(da * radius, radius - pk.radius)
        if (d > pk.sigma * 4) continue
        height += pk.height * Math.exp(-Math.pow(d / pk.sigma, PEAK_SHARPNESS))
      }

      // A spine under the peaks so the band reads as a connected range, then crag noise so
      // the silhouette is not a smooth curve.
      const spine = range.height[0] * (0.3 + 0.22 * detail(Math.cos(angle) * 40, Math.sin(angle) * 40))
      height = (height + spine) * taper
      height *= 1 + 0.16 * detail(x * 0.05, z * 0.05) + 0.07 * detail(x * 0.14, z * 0.14)

      positions[k] = x
      positions[k + 1] = height
      positions[k + 2] = z
      colorAt(c, x, height, z, 0.3)
      colors[k] = c.r
      colors[k + 1] = c.g
      colors[k + 2] = c.b
      k += 3
    }
  }

  const index = new Uint32Array(angles * rings * 6)
  let w = 0
  for (let r = 0; r < rings; r++) {
    for (let a = 0; a < angles; a++) {
      const a1 = (a + 1) % angles // the ring closes on itself
      const p0 = r * angles + a
      const p1 = r * angles + a1
      const p2 = (r + 1) * angles + a
      const p3 = (r + 1) * angles + a1
      index[w++] = p0
      index[w++] = p2
      index[w++] = p1
      index[w++] = p1
      index[w++] = p2
      index[w++] = p3
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  geometry.computeVertexNormals()
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  // The terrain material reads an occlusion attribute; horizon peaks are fully open.
  geometry.setAttribute('aOpenness', new BufferAttribute(new Float32Array(count).fill(1), 1))
  geometry.computeBoundingSphere()
  return geometry
}
