// Pure scroll math. No DOM, no state: every visual in the hero is a function of these.

import { BEAT_COUNT, BEAT_FADE, EASE_K } from '../scene/config'
import { clamp, smoothstep } from '../lib/math'

/**
 * Raw hero progress p in [0, 1].
 *
 *   p = clamp((scrollTop - heroTop) / (heroHeight - stageHeight), 0, 1)
 *
 * The sticky stage is exactly one screen tall, so it stays pinned while the hero
 * scrolls by (heroHeight - stageHeight). p therefore reaches 1 at the very moment
 * the stage starts to unpin, and stays clamped at 1 while #content slides over it.
 */
export function progressFromScroll(scrollTop: number, heroTop: number, track: number): number {
  if (track <= 0) return 0
  return clamp((scrollTop - heroTop) / track, 0, 1)
}

const TWO_PI_N = 2 * Math.PI * BEAT_COUNT

/**
 * Eased progress t.
 *
 *   t = p + K * sin(2*pi*N*p) / (2*pi*N)
 *
 * dt/dp = 1 + K * cos(2*pi*N*p): 1 - K (0.4 for K = 0.6) at beat centers
 * p = (i + 0.5) / N, so the camera and text dwell there, and 1 + K between beats.
 * t(0) = 0, t(1) = 1, beat centers map to themselves, and t is monotonic for K < 1.
 */
export function easeProgress(p: number): number {
  return p + (EASE_K * Math.sin(TWO_PI_N * p)) / TWO_PI_N
}

/** Beat i owns t in [i/N, (i+1)/N); t = 1 belongs to the last beat. */
export function beatIndexAt(t: number): number {
  return clamp(Math.floor(t * BEAT_COUNT), 0, BEAT_COUNT - 1)
}

/** t (and p, since the easing fixes them) at the center of beat i. */
export function beatCenter(i: number): number {
  return (i + 0.5) / BEAT_COUNT
}

export interface BeatEnvelope {
  /** 0..1 */
  opacity: number
  /** +1 = still entering from below, 0 = at rest, -1 = leaving upward. */
  offset: number
}

/**
 * Opacity and slide for beat i at eased progress t. A beat fades in over the first
 * BEAT_FADE of its window and out over the last BEAT_FADE, so neighbours never overlap.
 * The first beat skips its fade-in (visible at t = 0) and the last skips its fade-out
 * (visible through t = 1). Writes into `out` to stay allocation-free per frame.
 */
export function beatEnvelope(t: number, i: number, out: BeatEnvelope): BeatEnvelope {
  const u = t * BEAT_COUNT - i // local position in the beat's window, 0..1 inside it
  const last = BEAT_COUNT - 1
  if (u < 0 || u > 1 || (u === 1 && i !== last)) {
    out.opacity = 0
    out.offset = u < 0 ? 1 : -1
    return out
  }
  const fadeIn = i === 0 ? 1 : smoothstep(0, BEAT_FADE, u)
  const fadeOut = i === last ? 1 : 1 - smoothstep(1 - BEAT_FADE, 1, u)
  out.opacity = Math.min(fadeIn, fadeOut)
  out.offset = u < 0.5 ? 1 - fadeIn : fadeOut - 1
  return out
}
