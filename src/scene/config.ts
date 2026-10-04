// Every tunable constant for the hero lives in this file.
// Units: world units ~ metres, y is up, the climb heads toward -z.

import type { Vector3Tuple } from 'three'
import { GRASS_HEIGHT } from '../world/scale'

/* ------------------------------------------------------------------ */
/* Scroll track                                                        */
/* ------------------------------------------------------------------ */

/** Hero track length in screens (x 100svh). The stage stays pinned for HERO_SCREENS - 1 screens. */
export const HERO_SCREENS = 10

/**
 * Dwell stops on the climb (N in the t easing). The camera and the atmosphere slow at each
 * one; props in the Nepal layer are composed against their t values.
 */
export const BEAT_COUNT = 5

/**
 * How many of those stops carry copy in the lower-left copy zone, which the Nepal layer keeps
 * its props out of (COPY_ZONES in scene/nepal/anchors.ts). These are the first beats in
 * content/content.ts; Hero.tsx checks it.
 *
 * The last stop's window (t = 0.8 to 1.0) is the approach to the summit. It carries only a
 * title, set top right over the sky, so the corner the props were cleared from stays a pure
 * view and nothing moves: not the camera, the atmosphere schedule, or a single prayer flag,
 * all of which are placed at literal t values tuned against this rhythm.
 */
export const TEXT_BEAT_COUNT = 4

/**
 * Strength of the per-beat slowdown in the t easing (K). Travel speed dt/dp ranges
 * from 1 - K at beat centers to 1 + K between beats; K < 1 keeps t monotonic.
 */
export const EASE_K = 0.6

/** Fraction of a beat's t-window spent fading in, and again fading out. */
export const BEAT_FADE = 0.2

/**
 * Slide distance (px) of a beat entering (+) or leaving (-). Zero: the copy enters and
 * leaves by opacity alone, over BEAT_FADE of its window with a smoothstep ease, and the
 * windows never overlap, so one line of copy has fully gone before the next appears. A
 * slide on top read as the text drifting rather than fading.
 */
export const BEAT_SLIDE_PX = 0

/** Damping rate (1/s) of smoothed progress toward target progress. Lenis already smooths input. */
export const PROGRESS_DAMPING = 8

/** Largest frame delta (s) fed to damping, so a backgrounded tab does not jump on return. */
export const MAX_FRAME_DT = 0.1

/* ------------------------------------------------------------------ */
/* Renderer and camera                                                 */
/* ------------------------------------------------------------------ */

export const DPR_DESKTOP: [number, number] = [1, 1.5]
export const DPR_MOBILE: [number, number] = [1, 1.25]

export const CAMERA_FOV = 50
/**
 * Portrait screens: the vertical FOV widens (up to CAMERA_FOV_MAX) until the horizontal FOV
 * reaches CAMERA_MIN_HFOV, so a phone still sees the peaks and the sun at the summit.
 */
export const CAMERA_MIN_HFOV = 44
export const CAMERA_FOV_MAX = 80
export const CAMERA_NEAR = 0.5
export const CAMERA_FAR = 2000

/** Damping rate (1/s) of the final camera position and look target. */
export const CAMERA_DAMPING = 12

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

export const CLOUD_BASE_Y = 30
export const CLOUD_TOP_Y = 38
export const SUMMIT_Y = 60

/* ------------------------------------------------------------------ */
/* Terrain (all consumed by heightAt in terrain.ts)                    */
/* ------------------------------------------------------------------ */

/** Square terrain mesh, world units, centered at (TERRAIN_CENTER_X, TERRAIN_CENTER_Z). */
export const TERRAIN_SIZE = 500
export const TERRAIN_CENTER_X = 0
export const TERRAIN_CENTER_Z = -50
export const TERRAIN_SEGMENTS_DESKTOP = 224
export const TERRAIN_SEGMENTS_MOBILE = 128
export const TERRAIN_SEED = 7

/** Main massif: a Gaussian the camera climbs. Its top (plus detail) is the summit. */
export const MASSIF_X = 0
export const MASSIF_Z = -30
export const MASSIF_SIGMA = 40
export const MASSIF_HEIGHT = 61

/** Valley near the start: rolling floor between walls that meander along z. */
export const VALLEY_FLOOR_Y = 1
export const VALLEY_ROLL_AMP = 2.2
export const VALLEY_HALF_WIDTH = 50
export const VALLEY_WALL_END = 165
export const VALLEY_WALL_HEIGHT = 24
export const VALLEY_MEANDER_AMP = 16
export const VALLEY_MEANDER_FREQ = 0.012

/** Ridged fractal noise for rocky detail, scaled by the local base height. */
export const RIDGE_FREQ = 1 / 48
export const RIDGE_OCTAVES = 5
export const RIDGE_LACUNARITY = 2.03
export const RIDGE_GAIN = 0.5
/** detail = (DETAIL_BASE + DETAIL_SCALE * baseHeight) * (ridged - DETAIL_MEAN) */
export const DETAIL_BASE = 2
export const DETAIL_SCALE = 0.16
export const DETAIL_MEAN = 0.32
/** Detail fades to (1 - SUMMIT_CAP) on the top of the massif, leaving a summit to stand on. */
export const SUMMIT_CAP = 0.55

/**
 * Domain warp on the detail noise. Unwarped ridged noise runs in straight parallel creases;
 * displacing the sample point by a slow noise makes the ridges curve, fork and wander the
 * way real spurs do. Amplitude in world units, frequency in cycles per world unit.
 */
export const WARP_FREQ = 1 / 150
export const WARP_AMP = 30

/** Broad undulation under the ridges: large hollows and shoulders, so slopes are not planes. */
export const BROAD_FREQ = 1 / 90
export const BROAD_OCTAVES = 3
export const BROAD_AMP = 3.4

/**
 * The route the camera and the stone trail follow is graded ground: detail fades to
 * TRAIL_CORRIDOR_DETAIL of its strength within the first distance and is full past the
 * second. It keeps the trail walkable, the slabs flat and the near ground quiet where the
 * camera is closest to it.
 */
export const TRAIL_CORRIDOR: [number, number] = [7, 24]
export const TRAIL_CORRIDOR_DETAIL = 0.32
/** ...and only where there is a trail. Above the cloud base the ground is left rough. */
export const TRAIL_CORRIDOR_TOP: [number, number] = [26, 42]

export interface DistantPeak {
  /** Degrees from the -z axis (the summit view direction), positive toward +x. */
  angle: number
  /** Distance from the massif center. */
  radius: number
  height: number
  /** Width of the peak's exp(-(d / sigma)^sharpness) profile. */
  sigma: number
  /**
   * Profile exponent. Low is a broad, round massif; high is a sharp horn. Defaults to
   * PEAK_SHARPNESS. Every peak sharing one exponent is what made the skyline read as the
   * same cone stamped seventeen times.
   */
  sharpness?: number
  /**
   * How far the peak is drawn out along its own axis: 1 is a cone, 2 is a ridge twice as
   * long as it is wide. This is what turns a row of horns into massifs with shoulders.
   */
  stretch?: number
  /** Direction of that axis, degrees, so the ridges do not all run the same way. */
  twist?: number
}

/** Ring of distant peaks, concentrated in the final view direction (-z). */
export const DISTANT_PEAKS: DistantPeak[] = [
  { angle: -64, radius: 172, height: 44, sigma: 22, sharpness: 1.15, stretch: 1.9, twist: 28 },
  { angle: -40, radius: 215, height: 58, sigma: 26, sharpness: 1.6, stretch: 1.25, twist: -44 },
  { angle: -20, radius: 150, height: 42, sigma: 18, sharpness: 1.85, stretch: 1.1, twist: 12 },
  { angle: -4, radius: 225, height: 72, sigma: 28, sharpness: 1.3, stretch: 2.2, twist: 68 },
  { angle: 13, radius: 185, height: 58, sigma: 22, sharpness: 1.75, stretch: 1.15, twist: -20 },
  { angle: 30, radius: 142, height: 40, sigma: 17, sharpness: 1.05, stretch: 2.4, twist: 52 },
  { angle: 47, radius: 208, height: 62, sigma: 25, sharpness: 1.5, stretch: 1.35, twist: -66 },
  { angle: 68, radius: 162, height: 42, sigma: 20, sharpness: 1.95, stretch: 1.05, twist: 8 },
  { angle: 86, radius: 200, height: 36, sigma: 18, sharpness: 1.2, stretch: 1.8, twist: -34 },
  { angle: 128, radius: 185, height: 30, sigma: 22, sharpness: 1.1, stretch: 2.1, twist: 74 }, // side ridges seen from the valley
  { angle: -124, radius: 190, height: 32, sigma: 22, sharpness: 1.25, stretch: 1.7, twist: -58 },
  // Flanking spurs, low and close. They stay under the cloud sea, so they only ever show
  // on the climb, where they give the fog something to separate into layers.
  { angle: -101, radius: 118, height: 30, sigma: 25, sharpness: 1.1, stretch: 2.3, twist: 40 },
  { angle: 98, radius: 112, height: 27, sigma: 23, sharpness: 1.15, stretch: 2.0, twist: -26 },
  { angle: -142, radius: 152, height: 26, sigma: 26, sharpness: 1.05, stretch: 2.5, twist: 62 },
  { angle: 147, radius: 148, height: 23, sigma: 25, sharpness: 1.2, stretch: 1.9, twist: -50 },
  { angle: -74, radius: 96, height: 24, sigma: 19, sharpness: 1.4, stretch: 1.5, twist: 16 },
  { angle: 71, radius: 99, height: 22, sigma: 19, sharpness: 1.3, stretch: 1.6, twist: -12 },
]
/** Default profile exponent for a peak that does not state its own. */
export const PEAK_SHARPNESS = 1.35

/** Vertex colors: sRGB hex, blended by height bands and slope. */
export const TERRAIN_COLORS = {
  /** Damp valley floor. */
  valley: '#2a4243',
  /** Gentle ground higher up: drying alpine grass. */
  meadow: '#465138',
  /** Steep faces, low and warm. */
  rock: '#6b6053',
  /** Steep faces higher up, colder. */
  slate: '#5a636d',
  paleRock: '#9aa3ac',
  snow: '#eef1f4',
} as const

export const TERRAIN_BANDS = {
  /** Ground cover turns from valley green to dry olive between these heights... */
  meadow: [4, 22],
  /** ...and gives way to bare rock on slopes steeper than this (1 - normal.y). */
  steep: [0.18, 0.44],
  /** Rock cools from warm brown toward slate with height... */
  slate: [16, 34],
  /** ...and pales further up. */
  paleRock: [33, 47],
  /** Snow line: first drifts, then continuous cover. */
  snow: [42, 55],
  /** Snow slides off slopes steeper than this. */
  snowSlope: [0.26, 0.58],
  /** Noise jitter (world units) on band edges so they are not contour lines. */
  jitter: 3,
} as const

/**
 * Per-fragment rock shading. The mesh cannot carry relief at this scale, so the normal is
 * perturbed by noise instead: RELIEF is how hard, SCALE its wavelength in world units, and
 * FADE the view distance over which it stops (past it the detail is sub-pixel and crawls).
 * Strata are near-horizontal bedding bands, warped by the same noise.
 */
export const ROCK_RELIEF = 0.85
export const ROCK_RELIEF_SCALE = 3.2
export const ROCK_RELIEF_FADE: [number, number] = [90, 260]
export const ROCK_STRATA_FREQ = 0.55
export const ROCK_STRATA_AMOUNT = 0.07
/** Extra darkening in creases, from the same noise (contact shade the baked AO is too coarse for). */
export const ROCK_CREASE = 0.22

/**
 * Rock mottling, added per fragment so it survives however coarse the mesh is: two octaves
 * of value noise on world xz, as a +/- fraction of the surface color. The fine octave fades
 * out between these view distances, where it would be smaller than a pixel and shimmer.
 */
export const ROCK_MOTTLE = {
  coarseScale: 26,
  coarseAmount: 0.08,
  fineScale: 5.5,
  fineAmount: 0.05,
  fineFade: [60, 170] as [number, number],
}

/**
 * Baked sky occlusion. Ground below the height that is typical around it sits in a hollow
 * and sees less of the sky. AO_RADIUS sets what "around it" means, AO_RANGE is how far below
 * typical reaches full shade, and AO_MIN is how dark the sky light gets at the bottom of a
 * gully. All three in world units except AO_MIN, a multiplier.
 */
export const AO_RADIUS = 24
export const AO_RANGE = 5
export const AO_MIN = 0.55

/* ------------------------------------------------------------------ */
/* Camera path                                                         */
/* ------------------------------------------------------------------ */

export interface CameraWaypoint {
  pos: Vector3Tuple
  look: Vector3Tuple
}

/**
 * Waypoints at uniform t: waypoint i is reached exactly at t = i / (length - 1),
 * so with 11 entries they sit at t = 0, 0.1, 0.2, ... 1.0. Both curves are centripetal
 * Catmull-Rom splines through these points. Heights are targets; the clearance clamp
 * in cameraPath.ts may lift them.
 */
export const CAMERA_PATH: CameraWaypoint[] = [
  { pos: [4, 7, 176], look: [0, 22, 60] }, // 0.0
  { pos: [2, 8, 158], look: [0, 26, 40] }, // 0.1 valley floor, looking up at misty ridges
  { pos: [-3, 10, 128], look: [0, 28, 20] }, // 0.2
  { pos: [-6, 14, 98], look: [0, 31, 0] }, // 0.3 rising over the foothills
  { pos: [-3, 19, 66], look: [0, 35, -20] }, // 0.4
  { pos: [2, 25, 40], look: [0, 40, -30] }, // 0.5 mid-slope, just below the cloud base
  { pos: [3, 34, 29], look: [0, 46, -40] }, // 0.6 inside the cloud layer
  { pos: [1, 44, 17], look: [-60, 38, -40] }, // 0.7 just above the cloud tops, looking out over the sea
  { pos: [-1, 55, 3], look: [-35, 48, -110] }, // 0.8 easing the view back toward the summit direction
  { pos: [0, 63, -20], look: [-10, 48, -220] }, // 0.9 summit, looking out over the cloud sea
  { pos: [0, 63.5, -30], look: [-12, 46, -240] }, // 1.0
]

/** Minimum camera height above the ground (spec: >= 2.5). */
export const CAMERA_CLEARANCE = 2.5
/** Radius around the camera whose highest ground point the clearance is measured from. */
export const CAMERA_FOOTPRINT = 4
/** Resolution of the precomputed camera track. */
export const CAMERA_TRACK_SAMPLES = 1024
/**
 * Smoothing half-width, in t, applied to the clamped camera height. The height is first
 * dilated by twice this, so smoothing can only lift it, never dip below the clamp.
 */
export const CAMERA_SMOOTH_T = 0.015

/* ------------------------------------------------------------------ */
/* Atmosphere                                                          */
/* ------------------------------------------------------------------ */

/**
 * three's physically based lights divide diffuse by pi, so a light of intensity pi lights
 * a white surface to white. Schedule intensities below are multiples of this unit.
 */
export const LIGHT_UNIT = Math.PI

export interface AtmosphereKey {
  t: number
  /** Fog color; the sky's horizon uses exactly this color. */
  fog: string
  /** FogExp2 density. Visibility falls as exp(-(density * distance)^2). */
  density: number
  skyTop: string
  sunColor: string
  /** x LIGHT_UNIT */
  sunIntensity: number
  /** Degrees above the horizon. */
  sunElevation: number
  /** Degrees from -z (the summit view direction), positive toward +x. */
  sunAzimuth: number
  hemiSky: string
  hemiGround: string
  /** x LIGHT_UNIT */
  hemiIntensity: number
  /** Sun glow sprite opacity, 0..1. */
  glow: number
  /** Strength of the warm halo the sky shader adds around the sun. */
  halo: number
  /** Cloud floor and deck color. */
  cloud: string
  /** Mist particle opacity, 0..1 (0 hides them). */
  mist: number
}

/**
 * Keyed at the beat centers plus the whiteout at t = 0.6. Between keys every value is
 * interpolated with smoothstep on t; before the first key and after the last, they hold.
 */
export const ATMOSPHERE: AtmosphereKey[] = [
  {
    t: 0.1, // pre-dawn valley: the sun is dim and low behind the massif
    fog: '#b9c6d6',
    density: 0.0075,
    skyTop: '#7d93b3',
    sunColor: '#d9a896',
    sunIntensity: 0.35,
    sunElevation: 2,
    sunAzimuth: -8,
    hemiSky: '#c6d1de',
    hemiGround: '#3c4a51',
    hemiIntensity: 0.95,
    glow: 0.2,
    cloud: '#d5dce6',
    mist: 0.35,
    halo: 0.08,
  },
  {
    t: 0.3, // dawn
    fog: '#cdd6e2',
    density: 0.0065,
    skyTop: '#8fa8c8',
    sunColor: '#f2b880',
    sunIntensity: 0.7,
    sunElevation: 4,
    sunAzimuth: -12,
    hemiSky: '#d5dde8',
    hemiGround: '#55626a',
    hemiIntensity: 1,
    glow: 0.4,
    cloud: '#e1e7ee',
    mist: 0.45,
    halo: 0.22,
  },
  {
    t: 0.5, // thick morning mist
    fog: '#d6dde6',
    density: 0.011,
    skyTop: '#93aecf',
    sunColor: '#f4cca2',
    sunIntensity: 0.6,
    sunElevation: 6,
    sunAzimuth: -15,
    hemiSky: '#dee5ed',
    hemiGround: '#68747c',
    hemiIntensity: 1.05,
    glow: 0.3,
    cloud: '#e6ebf1',
    mist: 0.6,
    halo: 0.15,
  },
  {
    // Inside the cloud layer. Thick, but not the total whiteout it used to be: at 0.15 the
    // frame fell to about 25 levels of luminance between its 2nd and 98th percentile, which
    // is a blank screen for most of a screen's worth of scroll. The ridge has to stay
    // readable as a silhouette the whole way through. tools/ui-audit/contrast.mjs measures it.
    t: 0.6,
    fog: '#eef2f7',
    density: 0.035,
    skyTop: '#dae3ef', // a shade under the fog, so the sky keeps a gradient to read against
    sunColor: '#fbe8d2',
    sunIntensity: 0.5,
    sunElevation: 7,
    sunAzimuth: -17,
    hemiSky: '#f2f5f9',
    hemiGround: '#a9b3bc',
    hemiIntensity: 1.2,
    glow: 0.08,
    cloud: '#f1f4f8',
    mist: 0.5,
    halo: 0,
  },
  {
    t: 0.7, // breakthrough above the cloud tops
    fog: '#d9e4f0',
    density: 0.0035,
    skyTop: '#6f97c9',
    sunColor: '#fbd8a6',
    sunIntensity: 1.05,
    sunElevation: 8,
    sunAzimuth: -19,
    hemiSky: '#d2deec',
    hemiGround: '#5b666d',
    hemiIntensity: 1,
    glow: 0.6,
    cloud: '#f3f6fa',
    mist: 0.1,
    halo: 0.3,
  },
  {
    t: 0.9, // golden summit: warm haze, low sun ahead, glow visible
    fog: '#f0d9c2',
    density: 0.0025,
    skyTop: '#6a8fc0',
    sunColor: '#ffbd7a',
    sunIntensity: 1.2,
    sunElevation: 6,
    sunAzimuth: -22,
    hemiSky: '#dcdfe7',
    hemiGround: '#6b6560',
    hemiIntensity: 0.95,
    glow: 0.85,
    cloud: '#fbf0e4',
    mist: 0,
    halo: 0.45,
  },
]

/**
 * Skylight is not even: it is far brighter around the sun than opposite it. The schedule's
 * hemisphere light gives this share to a soft directional fill from the sun's side of the
 * sky instead, at this elevation, which is what gives a backlit slope its form. The rest
 * stays omnidirectional.
 */
export const SKY_FILL_SHARE = 0.35
export const SKY_FILL_ELEVATION = 45

/**
 * Ranges beyond the terrain mesh, drawn as two polar bands of sharp peaks. They exist for
 * the horizon only: aerial perspective turns the near band pale and the far one into a
 * ghost, which is what gives the summit view its depth. Heights clear the cloud sea, so
 * the gap between them and the terrain edge stays hidden under it.
 */
export interface FarRange {
  /** Center radius of the band and its width, from the massif center. */
  radius: number
  band: number
  peaks: number
  /** Peak height and half-width ranges, sampled per peak. */
  height: [number, number]
  sigma: [number, number]
  seed: number
  /** Mesh resolution: samples around the ring, and across the band. */
  angles: number
  rings: number
}

export const FAR_RANGES: FarRange[] = [
  { radius: 420, band: 200, peaks: 18, height: [58, 112], sigma: [26, 48], seed: 31, angles: 220, rings: 20 },
  { radius: 800, band: 260, peaks: 15, height: [95, 175], sigma: [44, 78], seed: 37, angles: 180, rings: 16 },
]

/* ------------------------------------------------------------------ */
/* Wind                                                                */
/* ------------------------------------------------------------------ */

/**
 * One wind for the scene: grass, snow and the Nepal layer's prayer flags lean and gust
 * together. Direction is the way it blows, in plan. These match the flags' own values
 * (WIND in src/scene/nepal/config.ts), which is what makes the two read as one weather.
 */
export const WIND_DIR: [number, number] = [-0.22, -1]
/** Resting strength, and how much a full gust adds on top of it. */
export const WIND_BASE = 1
export const WIND_GUST = 0.75
/** |scroll velocity| (px/frame) mapped to gust level 0..1, and its rise/fall rates (1/s). */
export const WIND_GUST_VELOCITY: [number, number] = [1.5, 28]
export const WIND_GUST_RISE = 2.5
export const WIND_GUST_FALL = 0.6
/** Sway phase speed (rad/s at strength 1). */
export const WIND_SPEED = 1.6
/** Phase held under reduced motion: one fixed, leaning pose. */
export const WIND_STATIC_PHASE = 1.9
/** World size of one gust cell: blades this far apart lean at different moments. */
export const WIND_GUST_SCALE = 26

/**
 * Sastrugi: the ripples wind carves across snow, added as normal detail wherever snow lies.
 * SCALE is the ripple spacing in world units, STRETCH how far they draw out downwind,
 * RELIEF how hard, and SHADE the cold tone left in their troughs.
 */
export const SNOW_CARVE_SCALE = 1.6
/**
 * Wind drifts: the broad form of a snowfield, an order of magnitude coarser than the
 * sastrugi. Without it the snow has fine ripples and no shape, which is what made a whole
 * summit read as one smooth plastic sheet. Wavelength in world units, and how hard it bends
 * the normal.
 */
export const SNOW_DRIFT_SCALE = 17
export const SNOW_DRIFT_STRETCH = 0.42
export const SNOW_DRIFT_RELIEF = 0.55
/** Drifts are shaded further than the sastrugi are, so mid-distance snow is not flat. */
export const SNOW_DRIFT_FADE = 0.06
export const SNOW_CARVE_STRETCH = 0.18
export const SNOW_CARVE_RELIEF = 0.9
export const SNOW_SHADE = '#c3d0de'

/** Sky dome radius; inside CAMERA_FAR, well outside the terrain. */
export const SKY_RADIUS = 1500
/**
 * How fast the sky leaves the horizon (fog) color for skyTop with elevation:
 * mix = (1 - exp(-SKY_FALLOFF * sin(elevation))) / (1 - exp(-SKY_FALLOFF)).
 */
export const SKY_FALLOFF = 3.5
/** Tightness of the sky halo around the sun (higher = smaller). */
export const SUN_HALO_POWER = 10
/** Glow sprite: distance from the camera along the sun direction, and angular size. */
export const SUN_GLOW_DISTANCE = 1000
export const SUN_GLOW_SIZE_DEG = 14

/* ------------------------------------------------------------------ */
/* Aerial perspective (consumed by fog.ts and Sky.tsx)                 */
/* ------------------------------------------------------------------ */

/**
 * Scale height of the air, world units: density falls by 1/e every FOG_SCALE_HEIGHT above
 * the camera. Smaller = sharper split between a washed-out valley and crisp peaks above it.
 */
export const FOG_SCALE_HEIGHT = 26
/** Clamp on the height factor: nothing is ever hazier or clearer than these multiples. */
export const FOG_MEAN_MIN = 0.35
export const FOG_MEAN_MAX = 3

/**
 * Inscatter. Haze looking into the sun is bright and warm, and a little cooler and deeper
 * looking away from it: how far the fog (and with it the sky's horizon) moves toward the
 * sun color at most, how tightly that is focused on the sun, and the cool side's strength.
 * Both sides scale with the schedule's `glow`, which is how much of the sun the scene can
 * see at all: a sun still behind the massif in the valley warms nothing.
 */
export const HAZE_SUN = 0.3
export const HAZE_SUN_POWER = 2
export const HAZE_AWAY = 0.14

/* ------------------------------------------------------------------ */
/* Clouds and mist                                                     */
/* ------------------------------------------------------------------ */

/** Opaque, up-facing cloud floor: invisible from below, hides the lower terrain from above. */
export const CLOUD_FLOOR_Y = CLOUD_BASE_Y + 2
/** Side of the (camera-centered) floor and deck planes; edges sit deep in fog. */
export const CLOUD_PLANE_SIZE = 3000
/** World size of one tile of the cloud texture on the floor, and how strongly it mottles it. */
export const CLOUD_FLOOR_TILE = 260
export const CLOUD_FLOOR_MOTTLE = 0.3
/**
 * The sea surface sits a little darker than the deck above it, which is what makes the
 * deck read as billows standing on it rather than as more of the same white.
 */
export const CLOUD_FLOOR_SHADE = 0.88

export interface CloudDeckPlane {
  y: number
  opacity: number
  /** World size of one texture tile. */
  tile: number
  /** Drift, world units per second along x and z (time-based; off under reduced motion). */
  drift: [number, number]
}

/** Translucent planes between CLOUD_BASE_Y and CLOUD_TOP_Y. */
export const CLOUD_DECK: CloudDeckPlane[] = [
  { y: 30.6, opacity: 0.6, tile: 220, drift: [0.8, 0.2] },
  { y: 34.4, opacity: 0.55, tile: 290, drift: [1.1, -0.15] },
  { y: 37.4, opacity: 0.5, tile: 350, drift: [1.4, 0.3] },
]

/** Ground closer than this is seen directly, not through the band, so it keeps its own color. */
export const CLOUD_BAND_NEAR: [number, number] = [10, 55]

/** How far terrain inside the cloud band is blended toward the cloud color (0..1). */
export const CLOUD_BAND_TINT = 0.85

/** A deck plane is invisible within FADE_NEAR of the camera's height, full beyond FADE_FAR. */
export const CLOUD_FADE_NEAR = 2
export const CLOUD_FADE_FAR = 8

/** Cloud texture: size in px and the noise band mapped to puff alpha (0 below, 1 above). */
export const CLOUD_TEXTURE_SIZE = 256
export const CLOUD_COVER: [number, number] = [0.36, 0.72]

/** Transparent draw order: glow sprite first, deck planes far to near, mist, then rays. */
export const RENDER_ORDER = { glow: 1, deck: 10, mist: 20, shafts: 30 } as const

/**
 * Crepuscular rays. They only show in the moments that earn them - breaking out of the
 * cloud layer, then the low sun at the summit - and their strength also follows the
 * schedule's glow, so rays never appear from a sun the scene cannot see.
 */
export const SHAFTS = {
  WINDOWS: [
    { range: [0.6, 0.83] as [number, number], strength: 0.42 },
    { range: [0.85, 1.02] as [number, number], strength: 0.24 },
  ],
  /** How fast the rays fade with distance from the sun on screen. */
  FALLOFF: 1.6,
  /** Held back this close to the sun, so the glow sprite keeps its own shape. */
  CORE: 0.17,
} as const

/* ------------------------------------------------------------------ */
/* Grass and ground cover                                              */
/* ------------------------------------------------------------------ */

/**
 * Instanced grass. Blades are placed once, in tufts, in a band along the route the camera
 * climbs - which is where the trail runs and where the camera ever gets close enough to
 * see them - and never on the slabs, on steep rock or above the snow line.
 */
export const GRASS = {
  /**
   * Blades at high quality. Low quality takes LOW_SCALE of them (see lib/quality.ts).
   *
   * Raised from 38,000 after measuring what the frame actually costs
   * (`npm run audit:cost`): the whole grass field was 1.0ms of an 11ms frame - a ninth of
   * it - against 3.2ms for the terrain and 3.5ms for three full-screen cloud quads. It is
   * instanced, chunked and frustum-culled, so it was never the expensive thing it looks
   * like, and the audit's "far denser" was affordable all along.
   */
  COUNT: 96000,
  LOW_SCALE: 0.35,
  /** Blades per tuft, and how far they scatter from its center. */
  TUFT: [4, 9] as [number, number],
  TUFT_RADIUS: 0.6,
  /** Half-width of the band either side of the route, and how fast density falls across it. */
  BAND: 20,
  BAND_FALLOFF: 2,
  /** Patchiness: wavelength of the bare/lush variation, and how deep it cuts. */
  PATCH_SCALE: 17,
  PATCH_DEPTH: 0.55,
  /** Bare ground this close to the route center: the stone slabs are there. */
  TRAIL_CLEAR: 1.2,
  /** Blade height range (world units, from world/scale) and width as a fraction of height. */
  HEIGHT: GRASS_HEIGHT,
  WIDTH: 0.17,
  /** Nothing grows above this height, or on ground steeper than this (1 - normal.y). */
  MAX_Y: 42,
  MAX_SLOPE: 0.5,
  /** A chunk further than this from the camera is not drawn; the fog has it anyway. The
   * frame-time guard (lib/perfGuard.ts) pulls this in further on a machine that needs it. */
  DRAW_DISTANCE: 74,
  GUARDED_DISTANCE: 36,
  /**
   * Past this distance a chunk swaps to the one-segment blade. A blade that is two or three
   * pixels tall does not need three segments to bend, and dropping to a single quad takes
   * the field's triangle count down by two thirds exactly where the detail cannot be seen -
   * which is what pays for the density close to the camera.
   */
  LOD_DISTANCE: 19,
  /** Blade bend downwind at strength 1, as a fraction of blade height. */
  BEND: 0.4,
  /** Base, tip and the drier tip used higher up. */
  COLORS: { base: '#3b4a32', tip: '#91a257', dry: '#a89c5f' },
  /**
   * The field is split into this many chunks along the route, each culled on its own.
   * More chunks means tighter culling, but each visible one is a draw call: at 52 chunks
   * and the longer draw distance the frame reached 61 calls, over the agreed ceiling of 60.
   * 40 keeps the same density inside roughly 20 visible chunks.
   */
  CHUNKS: 40,
  /** Blade segments: more is smoother, at 2 triangles each. */
  SEGMENTS: 3,
  LOW_SEGMENTS: 2,
  /** Segments on the far side of LOD_DISTANCE. */
  FAR_SEGMENTS: 1,
} as const

/** Boulders and scree scattered along the route, in three shapes. */
export const ROCKS = {
  COUNT: 1500,
  LOW_SCALE: 0.35,
  /** Radius (world units) of a rock, from pebble to sitting boulder. */
  SIZE: [0.2, 1.5] as [number, number],
  /** Band either side of the route, and how far back from the trail they start. */
  BAND: 46,
  CLEAR: 1.4,
  MAX_SLOPE: 0.72,
} as const

/**
 * Spindrift off the tallest horizon peak: particles lift off its ridge, stream downwind and
 * thin out. Sizes are large because the peak is hundreds of units away.
 */
export const PLUME = {
  COUNT: 220,
  LOW_COUNT: 90,
  /** How far downwind it streams, how high it lifts on the way, and its width at the ridge. */
  LENGTH: 150,
  RISE: 26,
  SPREAD: 22,
  /** Particle diameter (world units) and peak opacity. */
  SIZE: 19,
  OPACITY: 0.85,
  /** World units per second downwind. */
  SPEED: 9,
  /**
   * When the banner shows: in as the cloud breaks and the far peak first clears the deck,
   * out again as the camera reaches the summit.
   *
   * It used to fade in and stay on, which left it hanging at the summit as a lone horizontal
   * streak between two near peaks - the "lone cloud puff" the audit found. The peak it
   * streams from is on the far horizon ring and by then the reshaped near peaks stand in
   * front of it, so only the banner was left, detached from anything that explained it.
   */
  T_IN: [0.62, 0.74] as [number, number],
  T_OUT: [0.86, 0.95] as [number, number],
} as const

export const MIST_COUNT_DESKTOP = 300
export const MIST_COUNT_MOBILE = 160
/** Particles live in a cube of this size around the camera, wrapping at its faces. */
export const MIST_BOX = 90
/** Particle diameter, world units. */
export const MIST_SIZE = 6
/** Peak alpha of one particle at a schedule mist amount of 1. */
export const MIST_ALPHA = 0.55
/** Drift, world units per second (time-based; off under reduced motion). */
export const MIST_DRIFT: [number, number, number] = [0.7, 0.05, 0.35]

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

/** UI colors; main.tsx pushes them into the CSS theme variables at startup. */
export const PALETTE = {
  /** Text on the bright, misty scene. */
  ink: '#0f1b2d',
} as const
