// Resolves the placement specs in config.ts into world space, once. Pure and deterministic:
// the same terrain and camera path always give the same plan. Meshes are built from this,
// and the dev checks read it too.

import { MathUtils, Vector3 } from 'three'
import { mulberry32 } from '../noise'
import { getCameraTrack } from '../cameraPath'
import { CLOUD_BAND_TINT, CLOUD_BASE_Y, CLOUD_TOP_Y } from '../config'
import { BIAS, RATIOS, STEP } from '../../world/scale'
import { anchorAtT, behindCopy, cameraFrameAtT, catenary, groundFloor, groundTop, polylineSampler } from './anchors'
import {
  CHORTEN_BASE_HALF,
  CHORTEN_HEIGHT,
  CHORTEN_SKIRT,
  CHORTEN_STEP_HALF,
  CHORTEN_STONE_TOP,
} from './chortenGeometry'
import {
  CHORTEN_MAIN,
  CHORTEN_RADIAL_SAG,
  CHORTEN_RADIALS,
  CHORTEN_RADIAL_TIE_CLEAR,
  CHORTEN_SMALL,
  CHORTEN_STONE_SHOW,
  CHORTEN_TIE_Y,
  FLAG_END_MARGIN,
  FLAG_SETS,
  FLAG_SIZE_NEAR,
  POLE_RADIUS,
  POLE_SINK,
  TREES,
  type AnchorSpec,
  type ChortenSpec,
  type FlagSize,
} from './config'
import { CROWN_PROFILE, crownOf, crownReach, type Crown } from './crown'

export interface PlacedChorten {
  /** Base top center. */
  position: Vector3
  scale: number
  /** Radians about +y. */
  yaw: number
  /** Where radiating cords are tied on the spire. */
  tie: Vector3
}

export interface PlacedFlag {
  /** Top-center of the flag, on the cord. */
  top: Vector3
  /** Unit cord direction at the flag. */
  tangent: Vector3
  /** Arc position along the cord (plus a per-cord offset), for the traveling wave. */
  s: number
  /** Index into FLAG_COLORS. */
  color: number
  size: FlagSize
  amp: number
  glow: number
  phase: number
  /**
   * Per-flag size and tone wobble. Prayer flags are cut and dyed by hand and weather at
   * different rates, so a string of identical panels reads as printed tape. Width and hang
   * vary separately, and the tone shifts a little either side of the dye colour.
   */
  sizeW: number
  sizeH: number
  tone: number
}

export interface PlacedPole {
  /** Bottom center, already sunk below grade. */
  base: Vector3
  height: number
  /**
   * Which band this one is checked against; see world/scale RATIOS. A `peg` is one of the
   * short posts the summit chorten's cords are tied off to: sized to the chorten, which is
   * itself a composition constraint, so it has no band of its own.
   */
  kind: 'mast' | 'stake' | 'tall' | 'peg'
}

export interface PlacedFlagSet {
  id: string
  flags: PlacedFlag[]
  cords: Vector3[][]
  poles: PlacedPole[]
}

export interface NepalPlan {
  chortens: PlacedChorten[]
  /** Beat 1-4 strings. */
  sets: PlacedFlagSet[]
  /** Beat 5 cords radiating from the main chorten; shown only with the chorten. */
  radial: PlacedFlagSet
  /** Placement problems found while resolving (a seam the skirt cannot hide, a low flag...). */
  issues: string[]
}

/**
 * Seat a chorten so its whitewash steps clear the highest ground beneath them (a sliver of
 * the stone course still shows on the uphill side), and check that the stone base reaches
 * below the lowest ground under its full footprint, so no seam can show on a slope.
 */
function placeChorten(spec: ChortenSpec, issues: string[]): PlacedChorten {
  const { forward } = cameraFrameAtT(spec.t)
  const at = anchorAtT(spec.t, { right: spec.right, ahead: spec.ahead }, true)
  const s = spec.scale
  const stepTop = groundTop(at.x, at.z, CHORTEN_STEP_HALF * Math.SQRT2 * s)
  const low = groundFloor(at.x, at.z, CHORTEN_BASE_HALF * Math.SQRT2 * s)
  const baseTop = stepTop - (CHORTEN_STONE_TOP - CHORTEN_STONE_SHOW) * s
  if (baseTop - low > (CHORTEN_SKIRT - 0.3) * s) {
    issues.push(`chorten at t=${spec.t}: ground drops ${(baseTop - low).toFixed(2)} under the base; skirt is ${(CHORTEN_SKIRT * s).toFixed(2)}`)
  }
  const position = new Vector3(at.x, baseTop, at.z)
  const yaw = Math.atan2(-forward.x, -forward.z) + MathUtils.degToRad(spec.yaw)
  const tie = position.clone().setY(baseTop + CHORTEN_TIE_Y * s)
  return { position, scale: s, yaw, tie }
}

interface ResolvedAnchor {
  top: Vector3
  /** The post that holds the cord up, or null where it is tied into a tree. */
  pole: PlacedPole | null
  /** The crown the cord is tied into, so no flag is hung inside it. */
  crown: Crown | null
}

/** Anchor top in world space, plus the pole that holds it up. */
function placeAnchor(t: number, spec: AnchorSpec): ResolvedAnchor {
  const top =
    spec.from === 'camera'
      ? anchorAtT(t, { right: spec.right, ahead: spec.ahead, up: spec.up })
      : anchorAtT(t, { right: spec.right, ahead: spec.ahead, up: spec.up }, true)
  const bottom = groundFloor(top.x, top.z, POLE_RADIUS * 2) - POLE_SINK
  return {
    top,
    pole: { base: new Vector3(top.x, bottom, top.z), height: top.y - bottom, kind: spec.kind ?? 'mast' },
    crown: null,
  }
}

/** Where a named tree's crown is. Resolved exactly as floraPlan resolves TREES. */
function treeCrown(id: string): Crown | null {
  const spec = TREES.find((tr) => tr.id === id)
  if (!spec) return null
  return crownOf(anchorAtT(spec.t, { right: spec.right, ahead: spec.ahead }, true), spec.scale)
}

/**
 * How far into the crown a cord is tied, as a fraction of its reach: a little out toward
 * the other end of the string and well up into the crown, where a line would be thrown
 * over a high branch. Deep enough to sit inside the lumpy skin whichever way the tree was
 * turned (the profile's narrowest point), so the knot is always hidden in foliage, and
 * high enough that a span tied here clears the lens where the camera passes under it.
 */
const TIE_OUT = 0.25
const TIE_UP = 0.45

/** The tie point inside `crown`, on the side facing `toward`. */
function tieInto(crown: Crown, toward: Vector3): Vector3 {
  const dx = toward.x - crown.center.x
  const dz = toward.z - crown.center.z
  const len = Math.hypot(dx, dz) || 1
  return new Vector3(
    crown.center.x + (dx / len) * crown.across * TIE_OUT,
    crown.center.y + crown.up * TIE_UP,
    crown.center.z + (dz / len) * crown.across * TIE_OUT,
  )
}

if (Math.hypot(TIE_OUT, TIE_UP) >= CROWN_PROFILE.min) {
  throw new Error('plan: a cord tied into a tree would be tied outside the crown on its narrow side')
}

/**
 * Resolve a string's anchors. Poles are placed directly; a tree tie needs to know where the
 * cord goes next, so it is placed on a second pass once its neighbours are known.
 */
function resolveAnchors(t: number, specs: AnchorSpec[], label: string, issues: string[]): ResolvedAnchor[] {
  const first = specs.map((a): ResolvedAnchor => {
    if (!a.tree) return placeAnchor(t, a)
    const crown = treeCrown(a.tree)
    if (crown) return { top: crown.center, pole: null, crown }
    // A misspelt id should be loud, not a string hanging off nothing.
    issues.push(`${label}: no tree "${a.tree}" to tie to; standing a pole there instead`)
    return placeAnchor(t, a)
  })
  return first.map((a, i) => {
    if (!a.crown) return a
    const prev = first[i - 1]?.top
    const next = first[i + 1]?.top
    const toward = prev && next ? prev.clone().add(next).multiplyScalar(0.5) : (prev ?? next)!
    return { ...a, top: tieInto(a.crown, toward) }
  })
}

/**
 * Clear cord at the start of a span tied into a crown: up to where the cord leaves the
 * canopy at its widest, blossoms included, plus a hand's width. A flag hung inside the
 * crown would poke out of the foliage at odd angles.
 */
function clearOfCrown(points: Vector3[], crown: Crown): number {
  let s = 0
  for (let i = 1; i < points.length; i++) {
    if (crownReach(crown, points[i]!, CROWN_PROFILE.max * 1.12) >= 1) return s + FLAG_END_MARGIN
    s += points[i]!.distanceTo(points[i - 1]!)
  }
  return s
}

const DOWN = new Vector3(0, -1, 0)

/**
 * Hang flags along one span. Colours continue from `firstColor` in the traditional order;
 * flags are spaced evenly between the clear cord left at each end (`margins`), which is
 * longer at an end tied into a tree.
 */
function hangFlags(
  points: Vector3[],
  size: FlagSize,
  amp: number,
  glow: number,
  firstColor: number,
  rand: () => number,
  issues: string[],
  label: string,
  margins: [number, number] = [FLAG_END_MARGIN, FLAG_END_MARGIN],
): PlacedFlag[] {
  const cord = polylineSampler(points)
  const pitch = size.w + size.gap
  const usable = cord.length - margins[0] - margins[1]
  const count = Math.max(0, Math.floor((usable + size.gap) / pitch))
  const start = margins[0] + (usable - (count * pitch - size.gap)) / 2 + size.w / 2
  const offset = rand() * 100
  const flags: PlacedFlag[] = []
  for (let i = 0; i < count; i++) {
    const s = start + i * pitch
    const top = new Vector3()
    const tangent = new Vector3()
    cord.at(s, top, tangent)
    flags.push({
      top,
      tangent,
      s: s + offset,
      color: (firstColor + i) % 5,
      size,
      amp,
      glow,
      phase: rand() * Math.PI * 2,
      sizeW: 0.9 + rand() * 0.2,
      sizeH: 0.88 + rand() * 0.24,
      tone: 0.86 + rand() * 0.28,
    })
    // Hung high: the bottom edge at rest must clear the ground by a full swing's margin.
    const hang = DOWN.clone().addScaledVector(tangent, -DOWN.dot(tangent)).normalize()
    const bottom = top.clone().addScaledVector(hang, size.h)
    const clear = bottom.y - groundTop(bottom.x, bottom.z, size.h)
    if (clear < 0.8) issues.push(`${label}: flag ${i} hangs ${clear.toFixed(2)} above the ground`)
  }
  return flags
}

export function buildNepalPlan(): NepalPlan {
  const issues: string[] = []
  const rand = mulberry32(1123)

  const main = placeChorten(CHORTEN_MAIN, issues)
  const chortens = [main, ...CHORTEN_SMALL.map((s) => placeChorten(s, issues))]

  const sets: PlacedFlagSet[] = FLAG_SETS.map((set) => {
    const placed: PlacedFlagSet = { id: set.id, flags: [], cords: [], poles: [] }
    set.strings.forEach((spec, k) => {
      const anchors = resolveAnchors(spec.t, spec.anchors, `${set.id}[${k}]`, issues)
      for (const a of anchors) if (a.pole) placed.poles.push(a.pole)
      let hung = 0 // flags on this string so far: the colour sequence runs across its supports
      for (let i = 1; i < anchors.length; i++) {
        const from = anchors[i - 1]!
        const to = anchors[i]!
        const points = catenary(from.top, to.top, spec.sag)
        placed.cords.push(points)
        const label = `${set.id}[${k}.${i}]`
        // A tree end keeps its flags out of the foliage; a pole end needs only a hand's width.
        const margins: [number, number] = [
          from.crown ? clearOfCrown(points, from.crown) : FLAG_END_MARGIN,
          to.crown ? clearOfCrown([...points].reverse(), to.crown) : FLAG_END_MARGIN,
        ]
        const flags = hangFlags(points, spec.size, spec.amp ?? 1, spec.glow ?? 1, hung, rand, issues, label, margins)
        placed.flags.push(...flags)
        hung += flags.length
      }
    })
    return placed
  })

  // Beat 5: from the spire tie out to short poles, fanned relative to the beat camera.
  const radial: PlacedFlagSet = { id: 'beat5', flags: [], cords: [], poles: [] }
  const { forward, right } = cameraFrameAtT(CHORTEN_MAIN.t)
  CHORTEN_RADIALS.forEach((r, k) => {
    const bearing = MathUtils.degToRad(r.bearing)
    const x = main.position.x + r.dist * (forward.x * Math.cos(bearing) + right.x * Math.sin(bearing))
    const z = main.position.z + r.dist * (forward.z * Math.cos(bearing) + right.z * Math.sin(bearing))
    const ground = groundTop(x, z, POLE_RADIUS * 2)
    const top = new Vector3(x, ground + r.up, z)
    const bottom = groundFloor(x, z, POLE_RADIUS * 2) - POLE_SINK
    // Short pegs the chorten's cords are tied off to, not standing masts.
    radial.poles.push({ base: new Vector3(x, bottom, z), height: top.y - bottom, kind: 'peg' })
    const points = catenary(main.tie, top, CHORTEN_RADIAL_SAG)
    radial.cords.push(points)
    radial.flags.push(
      ...hangFlags(points, FLAG_SIZE_NEAR, 1.1, 1.2, 0, rand, issues, `beat5[${k}]`, [CHORTEN_RADIAL_TIE_CLEAR, FLAG_END_MARGIN]),
    )
  })

  checkPoleScale([...sets, radial], issues)
  checkCameraClearsGarlands([...sets, radial], issues)
  checkClearOfCloudBand([...sets, radial], issues)
  checkClearOfCopy(sets, issues)
  for (const chorten of chortens) {
    checkFlagsClearChorten(chorten, [...sets, radial], issues)
  }
  return { chortens, sets, radial, issues }
}

/**
 * Nothing on a string - post, cord or flag - may pass behind the copy while it is on screen.
 *
 * The same sweep the trees are held to (`behindCopy`). A thin dark post drifting through a
 * headline is exactly as much in the way as a canopy: the hero string's left mast used to
 * slide down through the Hello badge as the camera advanced, and the beat-3 gateway's left
 * pole showed behind the What I do headline on 4:3 screens.
 */
function checkClearOfCopy(sets: PlacedFlagSet[], issues: string[]): void {
  for (const set of sets) {
    for (const [i, pole] of set.poles.entries()) {
      const points = Array.from({ length: 9 }, (_, k) =>
        pole.base.clone().setY(pole.base.y + POLE_SINK + ((pole.height - POLE_SINK) * k) / 8),
      )
      const why = behindCopy({ points, spheres: [] })
      if (why) issues.push(`${set.id}: pole ${i} passes ${why}`)
    }
    for (const [ci, cord] of set.cords.entries()) {
      const why = behindCopy({ points: cord.filter((_, k) => k % 3 === 0), spheres: [] })
      if (why) issues.push(`${set.id}: cord ${ci} passes ${why}`)
    }
    const flagSpheres = set.flags.map((f) => ({
      center: f.top.clone().setY(f.top.y - f.size.h * 0.5),
      radius: Math.hypot(f.size.w, f.size.h) * 0.5,
    }))
    const why = behindCopy({ points: [], spheres: flagSpheres })
    if (why) issues.push(`${set.id}: a flag passes ${why}`)
  }
}

/**
 * How much of the cloud colour the Nepal materials mix into a fragment at height y: the
 * CLOUD_TINT band in materials.ts, evaluated on the CPU.
 */
function cloudTint(y: number): number {
  const ramp = (a: number, b: number, v: number) => {
    const u = Math.min(Math.max((v - a) / (b - a), 0), 1)
    return u * u * (3 - 2 * u)
  }
  return ramp(CLOUD_BASE_Y - 2, CLOUD_BASE_Y + 2, y) * (1 - ramp(CLOUD_TOP_Y, CLOUD_TOP_Y + 6, y)) * CLOUD_BAND_TINT
}

/** Above this share of cloud colour, cloth stops reading as its dye. */
const MAX_CLOUD_TINT = 0.12

/**
 * No flag, cord end or pole top may sit inside the cloud band.
 *
 * Inside it the materials tint everything toward the cloud colour, and while the camera is
 * still below the deck anything a metre or more above the base is dissolved with a hashed
 * alpha. Both are right for terrain vanishing into cloud and wrong for a string of flags a
 * few metres in front of the lens: the beat-3 string's far stake had come to stand on
 * ground above the cloud base after the terrain was rebuilt, and its upper span rendered as
 * white speckle with a bare white post at the end of it. Nothing checked, so nothing said.
 */
function checkClearOfCloudBand(sets: PlacedFlagSet[], issues: string[]): void {
  for (const set of sets) {
    const worst = set.flags.reduce((m, f) => Math.max(m, cloudTint(f.top.y), cloudTint(f.top.y - f.size.h)), 0)
    if (worst > MAX_CLOUD_TINT) {
      issues.push(`${set.id}: flags hang in the cloud band (${Math.round((worst / CLOUD_BAND_TINT) * 100)}% into it)`)
    }
    for (const [i, pole] of set.poles.entries()) {
      const top = pole.base.y + pole.height
      if (cloudTint(top) > MAX_CLOUD_TINT) issues.push(`${set.id}: pole ${i} stands into the cloud band (top ${top.toFixed(1)})`)
    }
  }
}

/**
 * The camera must never fly through a garland.
 *
 * It is allowed to pass *under* one - the beat-3 gateway is built to be walked beneath - and
 * it is allowed to pass beside one. What it may not do is put a flag in its face, which is
 * what the audit found when the panels were four times their proper size. Every cord sample
 * near the route is checked for one of those two clearances.
 */
function checkCameraClearsGarlands(sets: PlacedFlagSet[], issues: string[]): void {
  const track = getCameraTrack()
  /** Closer than this in plan and the cord is in the camera's way unless it clears it. */
  const SIDE = 2.2
  /** A cord overhead has to clear the lens by this much... */
  const OVERHEAD = 1.0
  /** ...and one the camera flies over has to sit at least this far below it, flags included. */
  const UNDERFOOT = 1.6

  for (const set of sets) {
    for (const [ci, cord] of set.cords.entries()) {
      let worst: { gap: number; over: number } | null = null
      for (const pt of cord) {
        for (let i = 0; i < track.samples; i++) {
          const cx = track.pos[i * 3]!
          const cy = track.pos[i * 3 + 1]!
          const cz = track.pos[i * 3 + 2]!
          const gap = Math.hypot(cx - pt.x, cz - pt.z)
          if (gap >= SIDE) continue
          const over = pt.y - cy
          // Above the lens is a gateway to pass under; below it is a garland to fly over.
          // Only a cord level with the lens puts a flag in the camera's face.
          if (over >= OVERHEAD || over <= -UNDERFOOT) continue
          if (!worst || Math.abs(over) < Math.abs(worst.over)) worst = { gap, over }
        }
      }
      if (worst) {
        issues.push(
          `${set.id} cord ${ci} is at lens height on the camera route: ${worst.gap.toFixed(1)} to the side, ${worst.over.toFixed(1)} above the lens`,
        )
      }
    }
  }
}

/**
 * The widest the chorten is at a given height above its base top, unscaled. Conservative:
 * every part is treated as a cylinder of its largest horizontal extent, and a square
 * plinth's corners reach further than its side, so half-widths are multiplied by sqrt(2).
 */
function chortenRadiusAt(y: number): number {
  const S = Math.SQRT2
  if (y < 0) return CHORTEN_BASE_HALF * S
  if (y < CHORTEN_STONE_TOP) return CHORTEN_BASE_HALF * S
  if (y < 1.0) return CHORTEN_STEP_HALF * S
  if (y < 1.45) return 1.85 * S
  if (y < 1.85) return 1.6 * S
  if (y < 3.9) return 1.55 // dome, widest at the shoulder
  if (y < 4.45) return 0.525 * S // harmika
  if (y < 4.59) return 0.65 * S // cornice
  if (y < 6.45) return 0.46 // spire rings
  if (y < 6.72) return 0.62 // parasol
  if (y <= CHORTEN_HEIGHT) return 0.17 // finial
  return 0
}

/**
 * No cord and no flag may pass through a chorten.
 *
 * A string anchored on the spire and running out to a pole should clear the dome, but that
 * depends on where the chorten was moved to, how tall it is and how far the flags hang -
 * three numbers that have each changed - so it is checked rather than assumed. Points are
 * taken into the chorten's own frame and compared against its silhouette.
 */
function checkFlagsClearChorten(chorten: PlacedChorten, sets: PlacedFlagSet[], issues: string[]): void {
  const s = chorten.scale
  const baseTop = chorten.position.y
  const hit = (x: number, y: number, z: number): boolean => {
    const local = (y - baseTop) / s
    if (local < -CHORTEN_SKIRT || local > CHORTEN_HEIGHT) return false
    const r = Math.hypot(x - chorten.position.x, z - chorten.position.z) / s
    return r < chortenRadiusAt(local)
  }

  for (const set of sets) {
    for (const [ci, cord] of set.cords.entries()) {
      for (const pt of cord) {
        // The radial cords are tied to the spire on purpose, so the attachment itself is
        // not a fault. Ignore anything within a short reach of the tie point.
        if (pt.distanceToSquared(chorten.tie) < (1.3 * s) ** 2) continue
        if (hit(pt.x, pt.y, pt.z)) {
          issues.push(`${set.id} cord ${ci} passes through a chorten at y=${pt.y.toFixed(2)}`)
          break
        }
      }
    }
    for (const [fi, flag] of set.flags.entries()) {
      // The flag hangs below its point on the cord; test the bottom edge too.
      if (flag.top.distanceToSquared(chorten.tie) < (1.3 * s) ** 2) continue
      if (hit(flag.top.x, flag.top.y, flag.top.z) || hit(flag.top.x, flag.top.y - flag.size.h, flag.top.z)) {
        issues.push(`${set.id} flag ${fi} intersects a chorten at y=${flag.top.y.toFixed(2)}`)
      }
    }
  }
}

/**
 * Report poles whose height is outside the band world/scale sets for their kind.
 *
 * A cord is tied to two different objects: a standing mast, and a short post pegged into the
 * ground. Checking both against the mast band is why all fourteen reported as out of scale
 * in phase 1 - the ratio table was missing an object, not the scene being wrong.
 *
 * `tall` is an explicit exception: the beat-3 gateway is planted downslope and has to reach
 * up past the camera that passes under it, so its length is set by the terrain rather than
 * by the table. It is still reported if it grows past twice the mast band, which would mean
 * the camera path had moved out from under it.
 */
function checkPoleScale(sets: PlacedFlagSet[], issues: string[]): void {
  const band = (r: { band: readonly number[] }) => r.band.map((v) => v * STEP * BIAS) as [number, number]
  const mast = band(RATIOS.flagPole)
  const stake = band(RATIOS.flagStake)
  for (const set of sets) {
    for (const [i, pole] of set.poles.entries()) {
      // Poles are sunk below grade, so the visible mast is shorter than the placed height.
      const visible = pole.height - POLE_SINK
      if (pole.kind === 'peg') {
        if (visible < 0.5) issues.push(`scale: ${set.id} peg ${i} shows only ${visible.toFixed(2)} above the snow`)
        continue
      }
      const [lo, hi] = pole.kind === 'stake' ? stake : mast
      const ceiling = pole.kind === 'tall' ? hi * 2 : hi
      const floor = pole.kind === 'tall' ? 0 : lo
      if (visible < floor || visible > ceiling) {
        issues.push(
          `scale: ${set.id} ${pole.kind} ${i} stands ${visible.toFixed(1)} against ${floor.toFixed(1)}-${ceiling.toFixed(1)}`,
        )
      }
    }
  }
}

let cached: NepalPlan | null = null

/** Built on first use, then shared (the terrain and camera track are fixed). */
export function getNepalPlan(): NepalPlan {
  return (cached ??= buildNepalPlan())
}
