// Rhododendron trees and low autumn scrub on the slopes below the cloud. Every placement is
// tested against the trail, the ground and the beat text zones, so the warm accents never
// land where the copy goes. Built once; pure and deterministic.

import { Vector3 } from 'three'
import { getCameraTrack } from '../cameraPath'
import { CLOUD_BASE_Y, TEXT_BEAT_COUNT } from '../config'
import { beatCenter } from '../../scroll/progress'
import { mulberry32 } from '../noise'
import { anchorAtT, behindCopy, groundNormal, groundY, inTextZoneAt, type Silhouette } from './anchors'
import {
  CONIFER,
  CONIFER_MAX_CROWN,
  FLAG_SETS,
  GROVES,
  HALF_DENSITY,
  JUNIPER,
  JUNIPER_COLORS,
  SHRUBS,
  SHRUB_COLORS,
  TREE,
  TREES,
} from './config'
import { CROWN_PROFILE, crownOf, crownRadius, crownReach } from './crown'
import { getNepalPlan } from './plan'
import { getTrailPlan } from './trailPlan'

export { crownRadius }

export interface PlacedTree {
  /** Base of the trunk, on the ground. */
  position: Vector3
  scale: number
  yaw: number
}

export interface PlacedBlossom {
  position: Vector3
  scale: number
  yaw: number
  pitch: number
}

export interface PlacedShrub {
  position: Vector3
  normal: Vector3
  scale: Vector3
  yaw: number
  /** Index into SHRUB_COLORS. */
  color: number
}

export interface PlacedConifer {
  /** Base of the trunk, on the ground. */
  position: Vector3
  /** Height multiplier on CONIFER.height. */
  scale: number
  yaw: number
  /** Slight per-tree lean, radians, so a grove is not a row of identical masts. */
  tilt: number
}

export interface FloraPlan {
  trees: PlacedTree[]
  conifers: PlacedConifer[]
  /** Waist-high juniper: the rung between the scrub and the trees. */
  junipers: PlacedShrub[]
  blossoms: PlacedBlossom[]
  shrubs: PlacedShrub[]
  /** Placements dropped by a rule, for the dev checks. */
  rejected: string[]
}

/**
 * What a rhododendron occupies, for the copy check: two points up the trunk, and one sphere
 * that holds the whole canopy - the lumpy profile at its widest, the horizontal spread, and
 * the blossoms that sit just proud of the skin.
 */
export function rhododendronSilhouette(base: Vector3, scale: number): Silhouette {
  const crownY = TREE.crownY * scale
  return {
    points: [0, 0.25, 0.5].map((f) => base.clone().setY(base.y + crownY * f)),
    spheres: [
      {
        center: base.clone().setY(base.y + crownY),
        radius: TREE.crownRadius * scale * TREE.crownSpread * CROWN_PROFILE.max * 1.12 + TREE.blossomSize * scale,
      },
    ],
  }
}

/** The same for a conifer: the trunk, and one sphere per tier of branches. */
export function coniferSilhouette(base: Vector3, scale: number): Silhouette {
  const h = CONIFER.height * scale
  const span = (1 - CONIFER.tierBase) / CONIFER.tiers
  const spheres = Array.from({ length: CONIFER.tiers }, (_, i) => ({
    center: base.clone().setY(base.y + h * (CONIFER.tierBase + (i + 0.5) * span)),
    radius: CONIFER.radius * scale * Math.pow(CONIFER.taper, i),
  }))
  return { points: [base.clone(), base.clone().setY(base.y + h * CONIFER.tierBase)], spheres }
}

/** Only the stops that carry copy have a zone to keep clear of. */
const BEATS = Array.from({ length: TEXT_BEAT_COUNT }, (_, i) => beatCenter(i))

function inAnyTextZone(point: Vector3, maxDepth: number): boolean {
  return BEATS.some((t) => inTextZoneAt(t, point, maxDepth))
}

function distanceToTrail(x: number, z: number, center: Vector3[]): number {
  let min = Infinity
  for (const c of center) {
    const d = (c.x - x) ** 2 + (c.z - z) ** 2
    if (d < min) min = d
  }
  return Math.sqrt(min)
}

/**
 * Shortest distance in plan from a point to the camera's own route. The trail runs beside
 * that route rather than on it, so clearing the trail is not the same as clearing the
 * camera.
 */
function distanceToCameraPath(x: number, z: number): number {
  const track = getCameraTrack()
  let min = Infinity
  for (let i = 0; i < track.samples; i++) {
    const d = (track.pos[i * 3]! - x) ** 2 + (track.pos[i * 3 + 2]! - z) ** 2
    if (d < min) min = d
  }
  return Math.sqrt(min)
}

/** A unit direction, biased to the upper half of the crown. */
function crownDirection(rand: () => number, out: Vector3): Vector3 {
  const y = -0.35 + rand() * 1.35
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const a = rand() * Math.PI * 2
  return out.set(r * Math.cos(a), y, r * Math.sin(a)).normalize()
}

export function buildFloraPlan(): FloraPlan {
  const rand = mulberry32(90210)
  const rejected: string[] = []
  const { center } = getTrailPlan()
  const flagSets = [...getNepalPlan().sets, getNepalPlan().radial]
  const poles = flagSets.flatMap((s) => s.poles)
  const cords = flagSets.flatMap((s) => s.cords)
  const flags = flagSets.flatMap((s) => s.flags)

  /** Canopy reach used for clearance: the lumpy skin at its widest, blossoms included. */
  const CANOPY = CROWN_PROFILE.max * 1.12

  /**
   * No string may run through a crown it is not tied to, and no flag may hang into one.
   * A cord tied into this tree ends inside its crown, so those are skipped by their ends.
   */
  const stringThroughCrown = (base: Vector3, scale: number): boolean => {
    const crown = crownOf(base, scale)
    for (const cord of cords) {
      const tiedHere = crownReach(crown, cord[0]!, CANOPY) < 1 || crownReach(crown, cord[cord.length - 1]!, CANOPY) < 1
      if (!tiedHere && cord.some((pt) => crownReach(crown, pt, CANOPY) < 1)) return true
    }
    return flags.some(
      (f) => crownReach(crown, f.top, CANOPY) < 1 || crownReach(crown, f.top.clone().setY(f.top.y - f.size.h), CANOPY) < 1,
    )
  }

  /* ---- rhododendron trees ---- */
  const trees: PlacedTree[] = []
  const blossoms: PlacedBlossom[] = []
  const conifers: PlacedConifer[] = []
  const dir = new Vector3()

  /** Every rule a rhododendron has to pass, wherever it came from. */
  const rhododendronRejects = (base: Vector3, scale: number): string | null => {
    if (distanceToTrail(base.x, base.z, center) < TREE.minTrailDist) return 'on the trail'
    if (poles.some((p) => Math.hypot(p.base.x - base.x, p.base.z - base.z) < TREE.minPoleDist)) return 'on a flag pole'
    const toCamera = distanceToCameraPath(base.x, base.z)
    if (toCamera < TREE.minCameraDist) {
      return `${toCamera.toFixed(1)} from the camera route, inside its ${TREE.minCameraDist.toFixed(1)} clearance`
    }
    // Rhododendron belongs on the lower slopes: no tree may reach into the cloud band.
    const top = base.y + (TREE.crownY + TREE.crownRadius * TREE.crownFlatten) * scale
    if (top > CLOUD_BASE_Y) return `crown reaches ${top.toFixed(1)}, at or above the cloud base`
    if (stringThroughCrown(base, scale)) return 'a flag string runs through the crown'
    return behindCopy(rhododendronSilhouette(base, scale))
  }

  /** Blossoms come in small trusses, not an even sprinkle. */
  const bloom = (base: Vector3, scale: number) => {
    const crown = base.clone().setY(base.y + TREE.crownY * scale)
    const count = Math.round(TREE.blossoms * (HALF_DENSITY ? 0.5 : 1))
    const seedDir = new Vector3()
    for (let b = 0; b < count; b++) {
      if (b % TREE.blossomCluster === 0) crownDirection(rand, seedDir)
      dir
        .set(
          seedDir.x + (rand() * 2 - 1) * TREE.blossomSpread,
          seedDir.y + (rand() * 2 - 1) * TREE.blossomSpread,
          seedDir.z + (rand() * 2 - 1) * TREE.blossomSpread,
        )
        .normalize()
      const r = TREE.crownRadius * scale * crownRadius(dir.x, dir.y, dir.z) * (0.99 + rand() * 0.12)
      blossoms.push({
        position: crown
          .clone()
          .add(new Vector3(dir.x * r * TREE.crownSpread, dir.y * r * TREE.crownFlatten, dir.z * r * TREE.crownSpread)),
        scale: TREE.blossomSize * scale * (0.75 + rand() * 0.6),
        yaw: rand() * Math.PI * 2,
        pitch: rand() * Math.PI,
      })
    }
  }

  TREES.forEach((spec, i) => {
    const at = anchorAtT(spec.t, { right: spec.right, ahead: spec.ahead }, true)
    const why = rhododendronRejects(at, spec.scale)
    if (why) {
      rejected.push(`tree ${spec.id ?? i}: ${why}`)
      return
    }
    trees.push({ position: at, scale: spec.scale, yaw: rand() * Math.PI * 2 })
    bloom(at, spec.scale)
  })

  // A flag string tied to a tree that the rules dropped would end in mid-air.
  for (const set of FLAG_SETS) {
    for (const string of set.strings) {
      for (const a of string.anchors) {
        if (!a.tree) continue
        const spec = TREES.find((tr) => tr.id === a.tree)
        const at = spec && anchorAtT(spec.t, { right: spec.right, ahead: spec.ahead }, true)
        if (!at || !trees.some((tr) => tr.position.distanceToSquared(at) < 1e-6)) {
          rejected.push(`${set.id}: its string is tied to tree "${a.tree}", which was not placed`)
        }
      }
    }
  }

  /* ---- groves ---- */
  // Scattered around a seed rather than listed one by one, so the spacing is irregular by
  // construction. Every candidate goes through its species' rules; a grove that cannot
  // place all its trees reports which rules stopped it.
  for (const [gi, grove] of GROVES.entries()) {
    const seed = anchorAtT(grove.t, { right: grove.right, ahead: grove.ahead }, true)
    const tally = new Map<string, number>()
    const reject = (why: string) => {
      const key = why.replace(/[0-9.]+/g, '#')
      tally.set(key, (tally.get(key) ?? 0) + 1)
    }
    let placed = 0
    for (let k = 0; k < grove.count * 6 && placed < grove.count; k++) {
      const a = rand() * Math.PI * 2
      const r = grove.radius * Math.sqrt(rand())
      const x = seed.x + Math.cos(a) * r
      const z = seed.z + Math.sin(a) * r
      const y = groundY(x, z)
      const scale = grove.scale[0] + rand() * (grove.scale[1] - grove.scale[0])
      const yaw = rand() * Math.PI * 2
      const tilt = (rand() * 2 - 1) * 0.035
      if (1 - groundNormal(x, z, new Vector3()).y > 0.5) {
        reject('too steep')
        continue
      }

      if (grove.species === 'rhododendron') {
        const base = new Vector3(x, y, z)
        const why = rhododendronRejects(base, scale)
        if (why) {
          reject(why)
          continue
        }
        // Crowns may touch, as they do in a real stand, but not grow through each other.
        const crowded = trees.some(
          (tr) =>
            Math.hypot(tr.position.x - x, tr.position.z - z) <
            TREE.crownRadius * TREE.crownSpread * (tr.scale + scale) * 0.85,
        )
        if (crowded) {
          reject('crowded')
          continue
        }
        placed++
        trees.push({ position: base, scale, yaw })
        bloom(base, scale)
        continue
      }

      // Conifers: three times the height of a rhododendron, so they stand further back.
      const top = y + CONIFER.height * scale
      if (top > CONIFER_MAX_CROWN) {
        reject('crown in the cloud')
        continue
      }
      if (distanceToTrail(x, z, center) < CONIFER.minTrailDist) {
        reject('on the trail')
        continue
      }
      if (distanceToCameraPath(x, z) < CONIFER.minCameraDist) {
        reject('near the camera route')
        continue
      }
      if (poles.some((pp) => Math.hypot(pp.base.x - x, pp.base.z - z) < CONIFER.minPoleDist)) {
        reject('on a flag pole')
        continue
      }
      const silhouette = coniferSilhouette(new Vector3(x, y, z), scale)
      if (cords.some((c) => c.some((pt) => silhouette.spheres.some((sp) => pt.distanceTo(sp.center) < sp.radius)))) {
        reject('a flag string runs through the crown')
        continue
      }
      const copy = behindCopy(silhouette)
      if (copy) {
        reject(copy)
        continue
      }
      // Keep them out of each other: a grove is spaced, not a thicket.
      const tooClose = conifers.some(
        (c) => Math.hypot(c.position.x - x, c.position.z - z) < CONIFER.radius * (c.scale + scale) * 0.8,
      )
      if (tooClose) {
        reject('crowded')
        continue
      }
      placed++
      conifers.push({ position: new Vector3(x, y - 0.25, z), scale, yaw, tilt })
    }
    if (placed < grove.count) {
      const why = [...tally.entries()]
        .sort((p, q) => q[1] - p[1])
        .slice(0, 3)
        .map(([w, n]) => `${n}x ${w}`)
      rejected.push(`${grove.species} grove ${gi}: placed ${placed} of ${grove.count} (${why.join('; ')})`)
    }
  }

  /* ---- juniper bushes ---- */
  const junipers: PlacedShrub[] = []
  {
    const target = Math.round(JUNIPER.count * (HALF_DENSITY ? 0.5 : 1))
    const perCluster = Math.ceil(target / JUNIPER.clusters)
    for (let c = 0; c < JUNIPER.clusters * 3 && junipers.length < target; c++) {
      const t = JUNIPER.t[0] + rand() * (JUNIPER.t[1] - JUNIPER.t[0])
      const side = rand() < 0.5 ? -1 : 1
      const lateral = JUNIPER.lateral[0] + rand() * (JUNIPER.lateral[1] - JUNIPER.lateral[0])
      const seed = anchorAtT(t, { right: lateral * side, ahead: (rand() * 2 - 1) * 12 }, true)
      let placed = 0
      for (let k = 0; k < perCluster * JUNIPER.attempts && placed < perCluster && junipers.length < target; k++) {
        const a = rand() * Math.PI * 2
        const r = JUNIPER.clusterRadius * Math.sqrt(rand())
        const x = seed.x + Math.cos(a) * r
        const z = seed.z + Math.sin(a) * r
        const y = groundY(x, z)
        if (y > JUNIPER.maxY) continue
        const normal = groundNormal(x, z, new Vector3())
        if (1 - normal.y > JUNIPER.maxSlope) continue
        if (distanceToTrail(x, z, center) < JUNIPER.minTrailDist) continue
        if (distanceToCameraPath(x, z) < JUNIPER.minCameraDist) continue
        const size = JUNIPER.size[0] + rand() * (JUNIPER.size[1] - JUNIPER.size[0])
        const position = new Vector3(x, y - size * 0.22, z)
        if (inAnyTextZone(position, 80)) continue
        placed++
        junipers.push({
          position,
          normal,
          scale: new Vector3(size * JUNIPER.spread, size * JUNIPER.flatten, size * JUNIPER.spread * (0.85 + rand() * 0.3)),
          yaw: rand() * Math.PI * 2,
          color: Math.floor(rand() * JUNIPER_COLORS.length),
        })
      }
    }
  }

  /* ---- autumn scrub ---- */
  const shrubs: PlacedShrub[] = []
  const target = Math.round(SHRUBS.count * (HALF_DENSITY ? 0.5 : 1))
  const perCluster = Math.ceil(target / SHRUBS.clusters)

  // Clumps whose seed lands on cliffs, above the cloud or over the trail yield nothing, so
  // keep seeding new ones until the target is met or the budget runs out.
  for (let c = 0; c < SHRUBS.clusters * 3 && shrubs.length < target; c++) {
    const t = SHRUBS.t[0] + rand() * (SHRUBS.t[1] - SHRUBS.t[0])
    const side = rand() < 0.5 ? -1 : 1
    const lateral = SHRUBS.lateral[0] + rand() * (SHRUBS.lateral[1] - SHRUBS.lateral[0])
    const seed = anchorAtT(t, { right: lateral * side, ahead: (rand() * 2 - 1) * 10 }, true)

    let placed = 0
    for (let k = 0; k < perCluster * SHRUBS.attempts && placed < perCluster && shrubs.length < target; k++) {
      const a = rand() * Math.PI * 2
      const r = SHRUBS.clusterRadius * Math.sqrt(rand())
      const x = seed.x + Math.cos(a) * r
      const z = seed.z + Math.sin(a) * r
      const y = groundY(x, z)
      if (y > SHRUBS.maxY) continue
      const normal = groundNormal(x, z, new Vector3())
      if (1 - normal.y > SHRUBS.maxSlope) continue
      if (distanceToTrail(x, z, center) < SHRUBS.minTrailDist) continue
      const size = SHRUBS.size[0] + rand() * (SHRUBS.size[1] - SHRUBS.size[0])
      const position = new Vector3(x, y - size * 0.2, z)
      if (inAnyTextZone(position, 70)) continue
      placed++
      shrubs.push({
        position,
        normal,
        scale: new Vector3(size, size * SHRUBS.flatten, size * (0.85 + rand() * 0.3)),
        yaw: rand() * Math.PI * 2,
        color: Math.floor(rand() * SHRUB_COLORS.length),
      })
    }
  }

  return { trees, conifers, junipers, blossoms, shrubs, rejected }
}

let cached: FloraPlan | null = null

export function getFloraPlan(): FloraPlan {
  return (cached ??= buildFloraPlan())
}
