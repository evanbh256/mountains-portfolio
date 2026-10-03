// The one wind every flag shares, plus the sun and cloud values the Nepali materials read.
// Driven from the single ticker's clock (scrollStore.dt) and the scene's t; no allocation.

import { damp, smoothstep } from '../../lib/math'
import { atmosphereAt } from '../atmosphere'
import { WIND } from './config'
import { nepalUniforms } from './materials'

const state = { gust: 0, phase: WIND.staticPhase }

/**
 * Gusts follow |scroll velocity| (direction-blind, so scrolling back up never reverses or
 * jitters the flutter), rising fast and settling slowly. The phase is integrated rather
 * than computed from time, so a change in wind speed never makes the waves jump.
 * Reduced motion holds one fixed, wavy pose.
 */
export function updateNepalUniforms(t: number, dt: number, velocity: number, reducedMotion: boolean): void {
  const u = nepalUniforms
  const atm = atmosphereAt(t)
  u.uCloudColor.value.copy(atm.cloud)
  u.uSunDir.value.copy(atm.sunDir)
  // Schedule intensity without LIGHT_UNIT: a fully lit surface's diffuse term (three divides by pi).
  u.uSunLight.value.copy(atm.sunColor).multiplyScalar(atm.sunIntensity)

  if (reducedMotion) {
    state.gust = 0
    u.uWindStrength.value = WIND.base
    u.uWindPhase.value = WIND.staticPhase
    return
  }

  const target = smoothstep(WIND.gustVelocity[0], WIND.gustVelocity[1], Math.abs(velocity))
  state.gust = damp(state.gust, target, target > state.gust ? WIND.gustRise : WIND.gustFall, dt)
  const strength = WIND.base * (1 + WIND.gust * state.gust)
  state.phase += dt * WIND.speed * (0.75 + 0.25 * strength)
  u.uWindStrength.value = strength
  u.uWindPhase.value = state.phase
}
