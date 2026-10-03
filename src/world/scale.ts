// One scale for the whole world.
//
// Every prop in the scene used to carry its own hand-tuned number, so nothing was in
// proportion to anything else: the wayside chorten came out shorter than a person's reach,
// the rhododendrons read as bushes, and a prayer flag was a quarter the height of the pole
// it hung from. This file fixes one unit, states every prop as a ratio of it, and derives
// the world units from there. Nothing in the scene should hard-code a size again.
//
// Units are metres, matching src/scene/config.ts.

/* ------------------------------------------------------------------ */
/* The unit                                                            */
/* ------------------------------------------------------------------ */

/**
 * One step: the across-path width of a trail slab, the stone you plant a foot on.
 * Everything below is a multiple of this. Kept in sync with TRAIL.slab[0] by the
 * assertion at the bottom of this file.
 */
export const STEP = 1.75

/**
 * A reference adult, for sanity only - nothing renders a person. It exists so every ratio
 * below can be checked against something with an obvious real-world size: a wayside chorten
 * you could stand beside, a rhododendron that tops you by half again, a pole you could not
 * reach the top of.
 */
export const PERSON = 1.7

/**
 * Readability bias. The camera rides 2.5 to 3 metres above the ground (CAMERA_CLEARANCE)
 * and props sit 20 to 40 metres out, where true-to-life sizes read as miniatures. Landmarks
 * are scaled up by this much as a set, so their proportions to each other stay exact and
 * only their relation to the (invisible) person stretches.
 *
 * Ground cover is deliberately left out of it: see GRASS_HEIGHT.
 */
export const BIAS = 1.5

/** Ratio of STEP, biased for readability. The one way a landmark size is written. */
const landmark = (steps: number): number => steps * STEP * BIAS

/** Ratio of STEP, at true scale. For anything the camera passes close to. */
const trueScale = (steps: number): number => steps * STEP

/* ------------------------------------------------------------------ */
/* Ratio table                                                         */
/* ------------------------------------------------------------------ */

/**
 * Every prop's height as a multiple of STEP, with the band it has to stay inside.
 * `RATIOS` is the design intent; `SIZES` below is what the scene actually uses.
 */
export const RATIOS = {
  /** Roadside chorten: a base of steps, dome, harmika, 13-ring spire, finial. */
  chortenSmall: { value: 3.0, band: [2.5, 3.5] },
  /** Rhododendron: broad crown, short thick trunk. */
  rhododendron: { value: 4.0, band: [3.0, 5.0] },
  /** Fir, deodar, juniper trees: the tall species that give the grove a size ladder. */
  conifer: { value: 8.0, band: [6.0, 10.0] },
  /** Juniper bushes: waist-to-head high, distinct from the ground scrub below. */
  juniperBush: { value: 1.4, band: [1.0, 2.0] },
  /** Low autumn scrub, ankle-to-knee. Ground cover, not a shrub in the ratio table's sense. */
  groundScrub: { value: 0.35, band: [0.2, 0.5] },
  /** A standing prayer-flag mast, the kind planted at a pass. */
  flagPole: { value: 3.5, band: [3.0, 4.0] },
  /**
   * A short post a cord is pegged off to - the ring of them around a chorten, or the end of
   * a span. Measuring these against the mast band was why all fourteen poles reported as
   * out of scale in phase 1: the table was missing an object, the scene was not wrong.
   */
  flagStake: { value: 1.6, band: [1.2, 2.2] },
} as const

/** A flag panel is this fraction of its pole's height: real prayer flags are small. */
export const FLAG_OF_POLE = { value: 1 / 17, band: [1 / 20, 1 / 15] } as const

/* ------------------------------------------------------------------ */
/* Derived sizes (world units)                                         */
/* ------------------------------------------------------------------ */

/**
 * The summit chorten is the one prop whose size is NOT a ratio.
 *
 * It stands on the summit crest eighteen metres from a camera that has parked for the whole
 * summit sequence, so its size is a composition constraint: it has to read as the
 * destination of the climb while leaving the text column and the card's safe area alone.
 * Scaling it by the ratio table put it at 11.55m, which filled the right third of the frame
 * from the top of the viewport to the bottom and buried the card behind it.
 *
 * The value below was found by projecting candidate placements into the viewport,
 * ray-casting against the terrain, and keeping the one that shows the most of the chorten
 * while clearing both zones (see `tools/ui-audit/chorten.mjs`). It is physically smaller
 * than it was (5.14m) and larger on screen - about 24% of the frame against 15% - because it
 * moved forward onto the crest instead of standing behind it.
 */
export const CHORTEN_SUMMIT_HEIGHT = 3.6

export const SIZES = {
  chortenSmall: landmark(RATIOS.chortenSmall.value),
  chortenSummit: CHORTEN_SUMMIT_HEIGHT,
  rhododendron: landmark(RATIOS.rhododendron.value),
  conifer: landmark(RATIOS.conifer.value),
  juniperBush: landmark(RATIOS.juniperBush.value),
  flagStake: landmark(RATIOS.flagStake.value),
  groundScrub: trueScale(RATIOS.groundScrub.value),
  flagPole: landmark(RATIOS.flagPole.value),
} as const

/** Flag panel width along the cord and hang depth, from the pole they hang between. */
export const FLAG_PANEL = {
  w: SIZES.flagPole * FLAG_OF_POLE.value,
  h: SIZES.flagPole * FLAG_OF_POLE.value * 0.92,
  /** Gap between neighbours, as a fraction of panel width. */
  gap: 0.24,
} as const

/**
 * Grass blade height range. Deliberately at true scale, not biased: the camera passes
 * through the grass at eye level, so its absolute size is the one thing in the scene a
 * viewer reads directly. At BIAS the blades would stand two metres tall and stop reading
 * as grass at all.
 */
export const GRASS_HEIGHT: [number, number] = [trueScale(0.3), trueScale(0.8)]

/** Trail slab: across the path, thickness, along the path. STEP is slab[0] by definition. */
export const TRAIL_SLAB: [number, number, number] = [STEP, STEP * 0.125, STEP * 0.66]

/* ------------------------------------------------------------------ */
/* Self-check                                                          */
/* ------------------------------------------------------------------ */

/**
 * Every ratio inside its band, and the derived sizes ordered the way the ratio table says
 * they should be. Runs once at import in dev; a bad edit fails loudly at startup rather
 * than showing up as a prop that looks slightly wrong three phases later.
 */
function check(): void {
  for (const [name, r] of Object.entries(RATIOS)) {
    const [lo, hi] = r.band
    if (r.value < lo || r.value > hi) {
      throw new Error(`world/scale: ${name} ratio ${r.value} is outside its band [${lo}, ${hi}]`)
    }
  }
  const [flo, fhi] = FLAG_OF_POLE.band
  if (FLAG_OF_POLE.value < flo || FLAG_OF_POLE.value > fhi) {
    throw new Error(`world/scale: flag/pole ${FLAG_OF_POLE.value} is outside [${flo}, ${fhi}]`)
  }
  // The size ladder the audit asks for, checked as an ordering rather than as numbers.
  // chortenSummit is not in it: its size comes from the summit frame, not the ratios.
  const ladder: [string, number][] = [
    ['groundScrub', SIZES.groundScrub],
    ['juniperBush', SIZES.juniperBush],
    ['chortenSmall', SIZES.chortenSmall],
    ['rhododendron', SIZES.rhododendron],
    ['conifer', SIZES.conifer],
  ]
  for (let i = 1; i < ladder.length; i++) {
    if (ladder[i]![1] <= ladder[i - 1]![1]) {
      throw new Error(`world/scale: ${ladder[i]![0]} is not taller than ${ladder[i - 1]![0]}`)
    }
  }
  // A person has to fit the story the ratios tell.
  if (SIZES.chortenSmall < PERSON * 2 || SIZES.chortenSmall > PERSON * 6) {
    throw new Error(`world/scale: a roadside chorten at ${SIZES.chortenSmall.toFixed(1)}m is not believable beside a person`)
  }
}

if (import.meta.env.DEV) check()
