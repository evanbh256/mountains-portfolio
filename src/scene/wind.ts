// One wind for the whole scene. Grass, carved snow and the Nepal layer's prayer flags all
// read the same direction and the same gusts, which is what makes them look like one
// weather rather than three animations.
//
// Gusts follow |scroll velocity| rather than the clock alone: the wind rises as the visitor
// climbs and settles when they stop. Direction-blind, so scrolling back up never reverses
// it. The phase is integrated instead of computed from time, so a change in strength never
// makes the waves jump. Reduced motion holds one fixed, leaning pose.

import { damp, smoothstep } from '../lib/math'
import {
  WIND_BASE,
  WIND_GUST,
  WIND_GUST_FALL,
  WIND_GUST_RISE,
  WIND_GUST_VELOCITY,
  WIND_SPEED,
  WIND_STATIC_PHASE,
} from './config'

export const wind = {
  /** Sway phase, radians. */
  phase: WIND_STATIC_PHASE,
  /** Current strength; 1 is the resting wind. */
  strength: WIND_BASE,
  /** Gust level, 0..1, for the debug HUD. */
  gust: 0,
}

export function updateWind(dt: number, velocity: number, reducedMotion: boolean): void {
  if (reducedMotion) {
    wind.gust = 0
    wind.strength = WIND_BASE
    wind.phase = WIND_STATIC_PHASE
    return
  }
  const target = smoothstep(WIND_GUST_VELOCITY[0], WIND_GUST_VELOCITY[1], Math.abs(velocity))
  wind.gust = damp(wind.gust, target, target > wind.gust ? WIND_GUST_RISE : WIND_GUST_FALL, dt)
  wind.strength = WIND_BASE * (1 + WIND_GUST * wind.gust)
  wind.phase += dt * WIND_SPEED * (0.75 + 0.25 * wind.strength)
}
