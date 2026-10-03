// The atmosphere schedule as a pure function of t. No time, no state: the same t always
// gives the same fog, sky and light.

import { Color, MathUtils, Vector3 } from 'three'
import { smoothstep } from '../lib/math'
import { ATMOSPHERE } from './config'

export interface AtmosphereState {
  fog: Color
  density: number
  skyTop: Color
  sunColor: Color
  sunIntensity: number
  /** Unit vector pointing from the scene toward the sun. */
  sunDir: Vector3
  hemiSky: Color
  hemiGround: Color
  hemiIntensity: number
  glow: number
  halo: number
  cloud: Color
  mist: number
}

export function createAtmosphereState(): AtmosphereState {
  return {
    fog: new Color(),
    density: 0,
    skyTop: new Color(),
    sunColor: new Color(),
    sunIntensity: 0,
    sunDir: new Vector3(0, 0, -1),
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemiIntensity: 0,
    glow: 0,
    halo: 0,
    cloud: new Color(),
    mist: 0,
  }
}

// Colors parsed once (Color stores linear values, so lerps below are in linear space).
const KEYS = ATMOSPHERE.map((k) => ({
  ...k,
  fogColor: new Color(k.fog),
  skyTopColor: new Color(k.skyTop),
  sunRgb: new Color(k.sunColor),
  hemiSkyColor: new Color(k.hemiSky),
  hemiGroundColor: new Color(k.hemiGround),
  cloudColor: new Color(k.cloud),
}))

const lerp = MathUtils.lerp

/** Sun direction from elevation/azimuth in degrees (azimuth 0 = -z, positive toward +x). */
export function sunDirection(elevationDeg: number, azimuthDeg: number, out: Vector3): Vector3 {
  const el = MathUtils.degToRad(elevationDeg)
  const az = MathUtils.degToRad(azimuthDeg)
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
}

/** The azimuth (degrees, as sunDirection takes them) a direction points along. */
export function sunAzimuthOf(dir: Vector3): number {
  return MathUtils.radToDeg(Math.atan2(dir.x, -dir.z))
}

/**
 * Atmosphere at eased progress t. Finds the surrounding pair of keys and blends them
 * with smoothstep(tA, tB, t); smoothstep clamps, so the first key holds before it and
 * the last key holds after it.
 */
export function sampleAtmosphere(t: number, out: AtmosphereState): AtmosphereState {
  let i = 0
  while (i < KEYS.length - 2 && t > KEYS[i + 1]!.t) i++
  const a = KEYS[i]!
  const b = KEYS[i + 1]!
  const u = smoothstep(a.t, b.t, t)

  out.fog.lerpColors(a.fogColor, b.fogColor, u)
  out.density = lerp(a.density, b.density, u)
  out.skyTop.lerpColors(a.skyTopColor, b.skyTopColor, u)
  out.sunColor.lerpColors(a.sunRgb, b.sunRgb, u)
  out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, u)
  sunDirection(lerp(a.sunElevation, b.sunElevation, u), lerp(a.sunAzimuth, b.sunAzimuth, u), out.sunDir)
  out.hemiSky.lerpColors(a.hemiSkyColor, b.hemiSkyColor, u)
  out.hemiGround.lerpColors(a.hemiGroundColor, b.hemiGroundColor, u)
  out.hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity, u)
  out.glow = lerp(a.glow, b.glow, u)
  out.halo = lerp(a.halo, b.halo, u)
  out.cloud.lerpColors(a.cloudColor, b.cloudColor, u)
  out.mist = lerp(a.mist, b.mist, u)
  return out
}

const shared = createAtmosphereState()
let sharedT = Number.NaN

/**
 * The atmosphere at t, computed once per distinct t and shared by every reader in a frame
 * (sky, clouds, mist), so their update order does not matter. Treat it as read-only.
 */
export function atmosphereAt(t: number): Readonly<AtmosphereState> {
  if (t !== sharedT) {
    sampleAtmosphere(t, shared)
    sharedT = t
  }
  return shared
}
