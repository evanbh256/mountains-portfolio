// Every tunable constant for the Nepali detail layer. Units match src/scene/config.ts:
// world units ~ metres, y up, the climb heads toward -z. Placements are written in the
// camera's own frame at a beat's t (see anchorAtT), so they survive retuning of the path.

import { IS_MOBILE } from '../../lib/env'
import { FLAG_PANEL, SIZES, TRAIL_SLAB } from '../../world/scale'

/**
 * Phones get about half the instances and simpler flags, at the same composition. One
 * decision, read by every generator. `?nepal-density=full|half` forces it, which is the
 * only way to see desktop density in a hidden preview pane (there `screen` reads 0x0 at
 * load, so the device check sees a phone).
 */
const densityParam = new URLSearchParams(window.location.search).get('nepal-density')
export const HALF_DENSITY = densityParam ? densityParam !== 'full' : IS_MOBILE

/* ------------------------------------------------------------------ */
/* Colors (sRGB hex)                                                   */
/* ------------------------------------------------------------------ */

/** Traditional order, repeated along every string: blue, white, red, green, yellow. */
export const FLAG_COLORS = ['#2f6fd0', '#f2eee6', '#d63a2f', '#3f9b57', '#efc23a'] as const

export const WHITEWASH = '#efe9df'
export const GOLD = '#d4a017'
export const STONE = '#8a867e'
export const POLE_WOOD = '#5a5047' // weathered, so a distant pole sits back in the mist
export const CORD = '#3a332c'

/** Fraction of full desaturation reached as fog closes in (0 = fog only, 1 = grey at the fog). */
export const DISTANCE_DESATURATION = 0.55

/** A prop whose nearest point lets less than this through the fog is skipped entirely. */
export const FOG_CULL_VISIBILITY = 0.002

/** Seen from below the cloud base, props above the cloud are dissolved this far (1 = gone). */
export const CLOUD_VEIL = 1

/* ------------------------------------------------------------------ */
/* Wind (one shared set of uniforms for every flag)                    */
/* ------------------------------------------------------------------ */

export const WIND = {
  /** Horizontal direction the wind blows toward (x, z): away from the camera, toward the far peaks. */
  direction: [-0.22, -1] as [number, number],
  /** Resting strength; flag swing angle scales with it. */
  base: 1,
  /** Extra strength at full gust: strength = base * (1 + gust * gustLevel). */
  gust: 0.75,
  /** |scroll velocity| (px/frame) mapped to gustLevel 0..1. */
  gustVelocity: [1.5, 28] as [number, number],
  /** Damping rates (1/s) of gustLevel rising toward, and falling back from, its target. */
  gustRise: 2.5,
  gustFall: 0.6,
  /** Flutter phase speed (rad/s at strength 1); it speeds up a little with strength. */
  speed: 1.6,
  /** Strength multiplier at SUMMIT_Y, blended in with the flag's own altitude. */
  altitudeBoost: 1.45,
  /** Phase held under reduced motion: a fixed, wavy pose. */
  staticPhase: 2.3,
} as const

/** Sun-through-cloth glow: added light = albedo * sun * backlight * pow(cos, power). */
export const BACKLIGHT = { strength: 0.9, power: 5 } as const

/* ------------------------------------------------------------------ */
/* Prayer flags                                                        */
/* ------------------------------------------------------------------ */

export interface FlagSize {
  /** Width along the cord and hang depth below it. */
  w: number
  h: number
  /** Space between neighbours along the cord. */
  gap: number
}

/**
 * Panel sizes come from world/scale: a prayer flag is a small square against a tall pole
 * (about 1/17 of it), not the bedsheet it used to be here. The mid-ground size is a touch
 * larger than the near one so a distant string still resolves through the haze - the only
 * place the scene is allowed to cheat scale, and only by a tenth.
 */
export const FLAG_SIZE_NEAR: FlagSize = { w: FLAG_PANEL.w, h: FLAG_PANEL.h, gap: FLAG_PANEL.w * FLAG_PANEL.gap }
export const FLAG_SIZE_MID: FlagSize = {
  w: FLAG_PANEL.w * 1.1,
  h: FLAG_PANEL.h * 1.1,
  gap: FLAG_PANEL.w * 1.1 * FLAG_PANEL.gap,
}

/** Plane subdivisions per flag (columns along the cord x rows down the hang). */
export const FLAG_SEGMENTS_DESKTOP: [number, number] = [6, 4]
export const FLAG_SEGMENTS_MOBILE: [number, number] = [4, 3]

/** Ragged bottom edge: max extra hang (fraction of h) on the bottom row of vertices. */
export const FLAG_FRAY = 0.14

/** Clear cord left at each end before the first flag. */
export const FLAG_END_MARGIN = 0.6

export const POLE_RADIUS = 0.09
/** Poles are sunk this far below the lowest ground under them, so no seam shows. */
export const POLE_SINK = 0.6

/**
 * How an anchor's height is measured:
 *   ground - `up` above the rendered ground at the anchor (a pole stands there)
 *   camera - `up` above the camera at the string's t (a pole still stands on the ground)
 */
export interface AnchorSpec {
  /** Position in the string's camera frame. Unused (and left out) when `tree` is set. */
  right?: number
  ahead?: number
  up?: number
  from?: 'ground' | 'camera'
  /**
   * What holds the cord up here. `mast` is a standing pole, `stake` a short pegged post.
   * They are different objects with different sizes, so they are checked against different
   * bands (see world/scale RATIOS.flagPole and flagStake). `tall` is a mast that is
   * deliberately outside the band because the composition needs it - the beat-3 gateway is
   * planted downslope and has to reach up past the camera that passes under it.
   */
  kind?: 'mast' | 'stake' | 'tall'
  /**
   * Tie the cord into this tree's crown (a TreeSpec id) instead of standing a pole. Where a
   * suitable tree is in reach this is how a string is actually hung in the hills: a line is
   * run between two trees, or from a tree to a post, not strung between bare masts. The
   * tree's position replaces right/ahead/up, which are then ignored, and no pole is built.
   */
  tree?: string
}

export interface FlagStringSpec {
  /** Beat t whose camera frame the anchors are written in. */
  t: number
  /**
   * Two or more anchors, each a pole or a tree. The cord hangs in one catenary per span and
   * the colour sequence carries on across intermediate supports.
   */
  anchors: AnchorSpec[]
  /** Midpoint drop of each span below its straight chord. */
  sag: number
  size: FlagSize
  /** Flutter amplitude multiplier (stronger wind). */
  amp?: number
  /** Backlight multiplier. */
  glow?: number
}

export interface FlagSetSpec {
  id: string
  strings: FlagStringSpec[]
}

/**
 * Beat plan (the colour order always reads blue-white-red-green-yellow from the first
 * anchor, so the first anchor is the viewer's left end for strings seen face-on).
 *
 * Wherever a tree stands in reach, the string is tied into it rather than to a pole: that
 * is how a line is actually hung in the hills, and a bare mast next to a tree reads as a
 * stage prop. Poles are left only where nothing grows - the open slope at the gateway, and
 * everything above the cloud.
 *
 *   1  across the valley into a rhododendron on the right. Nothing grows on the left of
 *      the route (see TREES), so the left end is a mast kept outside the frame; the one it
 *      replaces stood in view and drifted down through the Hello badge as the camera
 *      advanced (checkClearOfCopy)
 *   2  up the right-hand slope, tree to tree
 *   3  the gateway: from a stake low on the open left of the route, over the camera, into
 *      a rhododendron on the right. It used to carry on from a tall pole to a stake further
 *      up the slope; the rebuilt terrain put that stake on ground above the cloud base, and
 *      its span rendered as white speckle (checkClearOfCloudBand)
 *   4  a foreground string above the cloud tops, backlit, in stronger wind. No trees grow
 *      this high, so both ends are posts. Its mast still passes behind the Competitions
 *      copy late in that beat: the camera swings round the mountain there, and no position
 *      for either end - near, far, left or right of the route - stays clear. It is the one
 *      string checkClearOfCopy still reports
 *   5  radiating from the summit chorten (built from CHORTEN_RADIALS below)
 */
export const FLAG_SETS: FlagSetSpec[] = [
  {
    id: 'beat1',
    strings: [
      {
        t: 0.1,
        // Across the valley into the crown of a rhododendron on the right. The left end is
        // a mast far up the left slope that stays outside the frame for the whole climb at
        // every width up to 21:9, so the garland enters from the edge of the view and no
        // post is ever seen, let alone drifting down through the Hello badge.
        anchors: [{ right: -48, ahead: 6, up: 10 }, { tree: 'hello-mid' }],
        sag: 1.6,
        size: FLAG_SIZE_MID,
      },
    ],
  },
  {
    id: 'beat2',
    strings: [
      {
        t: 0.3,
        // From the tree beside the trail up to one standing higher on the slope.
        anchors: [{ tree: 'work-near' }, { tree: 'work-slope' }],
        sag: 1.2,
        size: FLAG_SIZE_MID,
      },
    ],
  },
  {
    id: 'beat3',
    strings: [
      {
        t: 0.5,
        // The left end is a stake planted low beside the route, behind the camera at this
        // beat, so the camera passes over it and it leaves the frame through the bottom
        // edge. The tall downslope pole it replaces rose through the What I do and Selected
        // Work copy as the camera closed on it; any post standing up the slope ahead and
        // left of the route does the same.
        anchors: [{ right: -5, ahead: -13, up: 3.8, kind: 'stake' }, { tree: 'work-slope' }],
        sag: 0.55,
        size: FLAG_SIZE_NEAR,
      },
    ],
  },
  {
    id: 'beat4',
    strings: [
      {
        t: 0.7,
        anchors: [
          { right: -2, ahead: 28, up: 8.2 },
          { right: 8, ahead: 3, up: 4.5, kind: 'stake' },
        ],
        sag: 0.9,
        size: FLAG_SIZE_NEAR,
        amp: 1.3,
        glow: 1.5,
      },
    ],
  },
]

/* ------------------------------------------------------------------ */
/* Chortens                                                            */
/* ------------------------------------------------------------------ */

/**
 * Height of the unscaled chorten geometry, base top to finial tip. chortenGeometry.ts
 * builds to exactly this (it re-exports the value), so a ChortenSpec's `scale` is just
 * `wanted height / CHORTEN_UNIT_HEIGHT` and every chorten comes out of world/scale.
 */
export const CHORTEN_UNIT_HEIGHT = 7.35

export interface ChortenSpec {
  t: number
  right: number
  ahead: number
  /** Height multiplier on CHORTEN_UNIT_HEIGHT. Derive it from world/scale, never by eye. */
  scale: number
  /** Yaw in degrees, so the plinth squares up to the view rather than to the world axes. */
  yaw: number
}

/**
 * The summit chorten: the destination of the climb, so it stands on the summit crest
 * itself, whole, on the skyline against the cloud sea.
 *
 * It used to stand 34m out, beyond the crest and 12m below the parked camera, so the snow
 * in front hid everything below the dome: it read as a spire peeping over a drift, a
 * background detail in a saddle. `tools/ui-audit/chorten.mjs` now ray-casts from the parked
 * camera as well as projecting the box, and this is the placement that shows the most of
 * it while clearing the copy and the card: 18m out, centred under the gap between the two
 * near peaks, 58-69% across and 68-94% down, with only the stone footing lost to the snow.
 * Its finial stops 2% short of the card's lower edge, which is the ceiling on its size.
 *
 * Written in the parked camera's own frame (t = 1), since that is the frame it is seen in.
 */
export const CHORTEN_MAIN: ChortenSpec = {
  t: 1,
  right: 3.75,
  ahead: 18.25,
  scale: SIZES.chortenSummit / CHORTEN_UNIT_HEIGHT,
  yaw: 12,
}

/**
 * Wayside chortens along the trail. The audit asks for them to read as deliberate landmarks
 * on the route rather than as one piece of scenery, so they are spaced up the climb and
 * always on the right: below the valley the camera flies above the ground, which puts
 * anything on the left inside a beat's text zone.
 *
 * Heights vary by a sixth around SIZES.chortenSmall, which keeps every one inside the
 * audit's 2.5-3.5 STEP band while stopping them reading as the same object stamped four
 * times. `plan.ts` checks each one's stone skirt against the ground it stands on.
 */
const WAYSIDE = SIZES.chortenSmall / CHORTEN_UNIT_HEIGHT

export const CHORTEN_SMALL: ChortenSpec[] = [
  { t: 0.12, right: 21, ahead: 45, scale: WAYSIDE * 0.86, yaw: -14 },
  { t: 0.3, right: 16, ahead: 36, scale: WAYSIDE, yaw: 20 },
  { t: 0.46, right: 15, ahead: 31, scale: WAYSIDE * 0.92, yaw: 34 },
  { t: 0.62, right: 18, ahead: 29, scale: WAYSIDE * 0.8, yaw: -8 },
]

/** Stone course left showing above the highest ground under the whitewash steps (unscaled). */
export const CHORTEN_STONE_SHOW = 0.15

/** Where on the spire (unscaled y above the base top) the radiating cords are tied. */
export const CHORTEN_TIE_Y = 6.55

export interface RadialSpec {
  /** Degrees from the beat camera's forward axis, positive to the right. */
  bearing: number
  /** Horizontal distance from the chorten. */
  dist: number
  /** Pole top above the ground. */
  up: number
}

/**
 * Cords from the spire down to pegs in the snow, the way strings are run off a stupa's
 * spire to the ground around it.
 *
 * Sized to the chorten rather than to the ratio table: now that it stands on the crest at
 * 3.6m, posts in the flag-stake band (3-6m) would stand taller than the spire they are
 * tied from. They are short pegs instead (kind 'peg'), and the fan is laid out so every
 * one stands on ground the parked camera can see, with its cord and flags in view -
 * `tools/ui-audit/summit.mjs` reports any peg that is hidden or that pokes up alone.
 *
 * The fan is biased to the right of the chorten because the summit's rail and glass panel
 * live on the left (summit/layout.ts PANEL_ZONE): a peg at a strongly negative bearing
 * projects behind an open panel.
 */
export const CHORTEN_RADIALS: RadialSpec[] = [
  { bearing: -35, dist: 6.5, up: 1.9 },
  { bearing: 20, dist: 7, up: 1.9 },
  { bearing: 70, dist: 7.5, up: 1.9 },
  { bearing: 115, dist: 7, up: 1.9 },
  { bearing: 150, dist: 6, up: 1.9 },
]
export const CHORTEN_RADIAL_SAG = 0.3

/**
 * Clear cord below the spire tie before the first flag. The chorten is small enough now
 * that a flag hung a hand's width from the tie lies against the harmika.
 */
export const CHORTEN_RADIAL_TIE_CLEAR = 1.1

/* ------------------------------------------------------------------ */
/* Stone trail                                                         */
/* ------------------------------------------------------------------ */

// Mid greys: a path reads as a path, never as bright stepping stones near the text.
export const TRAIL_COLORS = ['#767471', '#837f79', '#6a6865'] as const

export const TRAIL = {
  /** Climb the camera's ground track over this t range... */
  t: [0, 0.7] as [number, number],
  /** ...stopping as soon as the ground reaches this height, just below the cloud base. */
  maxY: 28.5,
  /** Arc length between slab centers (x TRAIL_MOBILE_PITCH on phones). */
  pitch: 1.05,
  /** Lateral offset from the camera's ground track, plus a slow wander across it. */
  /** Offset and wander are chosen so the trail always stays clear of the camera's track. */
  offset: 4.2,
  meanderAmp: 2.8,
  meanderLength: 47,
  /**
   * Slab box before per-instance scale: across the path, thickness, along the path.
   * slab[0] is STEP, the unit every other size in the world is a multiple of.
   */
  slab: TRAIL_SLAB,
  /** Per-slab randomness. */
  lateralJitter: 0.32,
  yawJitter: 15,
  scaleJitter: 0.22,
  /** Slabs are set this far into the ground. A slab resting exactly on the surface reads
   * as a card lying on it; a buried one reads as a stone that was placed and trodden in. */
  sink: 0.17,
  /** Degrees a slab may tip off the ground plane, so no two sit at the same angle. */
  tiltJitter: 7,
  /** An edge stone every N slabs, alternating sides. */
  edgeEvery: 4,
  edgeSize: 0.52,
  edgeSpread: 0.35,
} as const

/** Phones: fewer, slightly larger slabs, so the path still reads. */
export const TRAIL_MOBILE_PITCH = 1.85
export const TRAIL_MOBILE_SCALE = 1.25

/* ------------------------------------------------------------------ */
/* Rhododendron and shrubs                                             */
/* ------------------------------------------------------------------ */

export const CRIMSON = '#d1122b'
export const CROWN_GREEN = '#22331f'
export const TRUNK_BARK = '#3b2f28'
export const SHRUB_COLORS = ['#b5532a', '#d9782d', '#9c2a1f'] as const

/**
 * The rhododendron's silhouette, written as fractions of its own height so the tree keeps
 * its proportions whatever world/scale says that height is. The fractions are the ones the
 * hand-tuned 4.5-unit tree had; only the height it is measured against has changed.
 */
const RHODO_H = SIZES.rhododendron
const RHODO_CROWN_RADIUS = RHODO_H * 0.378

export const TREE = {
  /** Short, thick dark trunk, left visible under the crown. */
  trunkRadius: RHODO_H * 0.0667,
  /** Lumpy crown, centered this far above the ground, with this base radius. */
  crownY: RHODO_H * 0.667,
  crownRadius: RHODO_CROWN_RADIUS,
  /** Crowns are a little broader than they are tall, never umbrellas. */
  crownSpread: 1.08,
  crownFlatten: 0.88,
  /**
   * Blossoms per tree (x0.5 on phones), in small clusters over the crown's skin.
   *
   * Scaling the old count and size with the tree turned each blossom into a half-metre
   * octahedron: at the new height they read as chunky red boxes stuck to the canopy rather
   * than as trusses. A rhododendron truss is nearer a fifth of a metre, so they are smaller
   * and there are more of them - which is also what makes the canopy read as flowering
   * rather than as a green shape with red decorations on it.
   */
  blossoms: 320,
  blossomSize: RHODO_H * 0.019,
  /** Blossoms per cluster, and how far a cluster spreads across the crown (radians). */
  blossomCluster: 6,
  blossomSpread: 0.24,
  /**
   * Keep clear of the trail and of flag poles. Both are crown-relative: a bigger tree
   * needs to stand further back, or its canopy hangs over the path it is framing.
   */
  minTrailDist: RHODO_CROWN_RADIUS * 1.5,
  minPoleDist: RHODO_CROWN_RADIUS * 1.2,
  /**
   * ...and clear of the camera's own route. Without this a tree can satisfy every other
   * rule and still loom at the edge of frame, cropped to a handful of blossoms with no
   * trunk or crown to explain them. Crown-relative, like the others.
   */
  minCameraDist: RHODO_CROWN_RADIUS * 3.4,
} as const

export interface TreeSpec {
  /** Beat t whose camera frame this is written in. */
  t: number
  right: number
  ahead: number
  scale: number
  /** Names a tree that a prayer-flag string is tied to (AnchorSpec.tree). */
  id?: string
}

/**
 * 9 rhododendrons on the lower slopes (beats 1-3), all on the right of the route.
 *
 * Nothing stands on the left, and that is a finding rather than a choice. Below the valley
 * rim the camera flies above the ground, so anything on the left drifts down and outward
 * through the bottom-left corner as the camera closes in - which is where the copy is.
 * Scanning the left slope for a rhododendron that stays clear of the copy at every scroll
 * position (`treeBehindCopy`) found none in view anywhere on the climb, and none even when
 * only the Hello badge and headline were protected. The upper-left tree that used to
 * stand at beat 3 passed behind the Selected Work copy at 4:3 and was removed with the
 * left-hand groves.
 */
export const TREES: TreeSpec[] = [
  { t: 0.1, right: 15, ahead: 26, scale: 1.15 },
  { t: 0.1, right: 24, ahead: 38, scale: 1 },
  { t: 0.2, right: 20, ahead: 30, scale: 1.05, id: 'hello-mid' },
  { t: 0.1, right: 33, ahead: 57, scale: 1.05, id: 'hello-far' },
  { t: 0.3, right: 17, ahead: 22, scale: 1.1 },
  { t: 0.3, right: 22, ahead: 32, scale: 0.9, id: 'work-near' },
  { t: 0.3, right: 33, ahead: 40, scale: 1 },
  // Set back from the beat-4 poles: at world/scale sizes a crown reaches nearly 4 units,
  // so the old 14-and-18-out placements stood inside their own clearance radius.
  { t: 0.4, right: 20, ahead: 25, scale: 0.95, id: 'work-slope' },
  { t: 0.4, right: 27, ahead: 31, scale: 0.7 },
]

/* ------------------------------------------------------------------ */
/* Juniper                                                             */
/* ------------------------------------------------------------------ */

/** Dark, slightly blue: juniper against the warm autumn scrub. */
export const JUNIPER_COLORS = ['#35503f', '#2c4636', '#3d5a45'] as const

/**
 * Juniper bushes: the waist-to-head-high step between the ankle-high scrub and the trees,
 * which is the rung the size ladder was missing. SIZES.juniperBush was defined in phase 1
 * and left unclaimed; this is the species that claims it.
 */
export const JUNIPER = {
  count: 90,
  clusters: 16,
  clusterRadius: 5.5,
  attempts: 8,
  /** Scatter range along the climb and across it. */
  t: [0.04, 0.58] as [number, number],
  lateral: [8, 40] as [number, number],
  /** Height range around SIZES.juniperBush. */
  size: [SIZES.juniperBush * 0.62, SIZES.juniperBush * 1.1] as [number, number],
  /** Broader than they are tall, the way a wind-clipped juniper grows. */
  flatten: 0.78,
  spread: 1.18,
  maxY: 27,
  maxSlope: 0.55,
  minTrailDist: 5,
  /** Big enough to loom if it stands on the route. */
  minCameraDist: 11,
} as const

/* ------------------------------------------------------------------ */
/* Conifers                                                            */
/* ------------------------------------------------------------------ */

export const CONIFER_NEEDLE = '#1f3a2f'
export const CONIFER_BARK = '#4a382c'

/**
 * Fir and deodar: the tall species that gives the slope a size ladder against the broad,
 * low rhododendron. Proportions are fractions of the tree's own height, so the silhouette
 * holds whatever world/scale says that height is.
 */
const CONIFER_H = SIZES.conifer

export const CONIFER = {
  /** Full height of a mature tree; individual trees scale down from it. */
  height: CONIFER_H,
  trunkRadius: CONIFER_H * 0.021,
  /** Where the lowest skirt of branches starts, as a fraction of height. */
  tierBase: 0.17,
  /** Stacked cones from tierBase to the tip. */
  tiers: 4,
  /** Radius of the lowest tier. */
  radius: CONIFER_H * 0.165,
  /** Each tier above is this fraction of the one below. */
  taper: 0.74,
  /** How far each tier overlaps the one below, as a fraction of its own height. */
  overlap: 0.34,
  /** Keep clear of the trail, the poles and the camera's route. */
  minTrailDist: CONIFER_H * 0.2,
  minPoleDist: CONIFER_H * 0.16,
  minCameraDist: CONIFER_H * 0.85,
} as const

export interface GroveSpec {
  /**
   * What grows here. Every grove on the left of the route is rhododendron: the conifer's
   * stacked cones read as flat dark spikes against the blossoming crowns on the right, so
   * the two sides of the valley looked like two different scenes.
   */
  species: 'rhododendron' | 'conifer'
  /** Beat t whose camera frame the grove center is written in. */
  t: number
  right: number
  ahead: number
  /** Trees attempted in this grove. */
  count: number
  /** Scatter radius around the center. */
  radius: number
  /** Per-tree height multiplier on the species' full height (SIZES.rhododendron or CONIFER.height). */
  scale: [number, number]
}

/**
 * Groves on the lower slopes. Written as groves rather than as individual trees so the
 * spacing is irregular by construction: a seed point and a radius, scattered and then put
 * through the same rejection rules as everything else, `treeBehindCopy` included.
 *
 * Both are rhododendron. They were fir and deodar, whose stacked cones read as flat dark
 * spikes against the blossoming crowns in front of them, and three more conifer groves
 * stood on the left of the route, where no tree can stay clear of the copy (see TREES).
 * Set `species: 'conifer'` to bring the firs back; the species and its rules are intact.
 */
export const GROVES: GroveSpec[] = [
  { species: 'rhododendron', t: 0.12, right: 30, ahead: 52, count: 6, radius: 15, scale: [0.8, 1.05] },
  { species: 'rhododendron', t: 0.3, right: 34, ahead: 48, count: 5, radius: 14, scale: [0.75, 1] },
]

/** Nothing above this height: conifers stop below the cloud deck, like the rhododendrons. */
export const CONIFER_MAX_CROWN = 29

export const SHRUBS = {
  /** Clumps of low autumn scrub on the mid slopes (halved on phones). */
  count: 420,
  clusters: 34,
  clusterRadius: 4.2,
  /** Sampling attempts per wanted shrub, before a clump gives up. */
  attempts: 8,
  /** Scatter range along the climb and across it. */
  t: [0.02, 0.62] as [number, number],
  lateral: [6, 46] as [number, number],
  /**
   * Ground scrub, at true scale rather than the landmark bias: these are the ankle-high
   * cushions between the stones, not the waist-high juniper bushes in the ratio table.
   * SIZES.juniperBush is still unclaimed - it wants its own species (phase 4).
   */
  size: [SIZES.groundScrub * 0.55, SIZES.groundScrub * 1.3] as [number, number],
  /** Low domes, not flat plates. */
  flatten: 0.72,
  /** Nothing above this height (just under the cloud base) or on cliffs. */
  maxY: 28,
  maxSlope: 0.62,
  minTrailDist: 4,
} as const
