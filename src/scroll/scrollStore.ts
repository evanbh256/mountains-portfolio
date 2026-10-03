// One source of truth for scroll-driven state.
//
// Per-frame values live on a plain mutable object that loops read directly.
// React only ever sees the one discrete value (beatIndex) through useSyncExternalStore,
// so components re-render at beat boundaries, never per frame.

import { useSyncExternalStore } from 'react'
import type Lenis from 'lenis'
import { MAX_FRAME_DT, PROGRESS_DAMPING } from '../scene/config'
import { damp } from '../lib/math'
import { beatCenter, beatIndexAt, easeProgress, progressFromScroll } from './progress'

export interface ScrollState {
  /** Lenis's smoothed scrollTop of #scroll-root, px. */
  scroll: number
  /** Raw hero progress from the current scroll position. */
  targetP: number
  /** targetP damped over time. */
  p: number
  /** Eased progress; drives camera, atmosphere and text. */
  t: number
  /** Lenis scroll velocity, px per frame. */
  velocity: number
  /** Active beat, floor(t * N). */
  beatIndex: number
  /** Seconds, from the ticker clock. */
  time: number
  /** Clamped frame delta, seconds. */
  dt: number
}

export const scrollStore: ScrollState = {
  scroll: 0,
  targetP: 0,
  p: 0,
  t: 0,
  velocity: 0,
  beatIndex: 0,
  time: 0,
  dt: 0,
}

/** Cached hero geometry, refreshed by a ResizeObserver (never read from the DOM per frame). */
export const heroLayout = {
  heroTop: 0,
  heroHeight: 0,
  stageHeight: 0,
  /** Distance the stage stays pinned: heroHeight - stageHeight. */
  track: 0,
}

/** Handle to the single Lenis instance and the motion mode, both owned by ScrollRig. */
export const rig: { lenis: Lenis | null; reducedMotion: boolean } = {
  lenis: null,
  reducedMotion: false,
}

/* ---------------------------------------------------------------- */
/* Per-frame update (called by the ticker in ScrollRig)             */
/* ---------------------------------------------------------------- */

let primed = false

export function updateScrollState(
  scroll: number,
  velocity: number,
  time: number,
  dt: number,
  smooth: boolean,
): void {
  const s = scrollStore
  const L = heroLayout
  s.scroll = scroll
  s.velocity = velocity
  s.time = time
  s.dt = Math.min(dt, MAX_FRAME_DT)
  s.targetP = progressFromScroll(scroll, L.heroTop, L.track)

  if (!primed || !smooth) {
    // First frame (or reduced motion): no easing in from p = 0.
    s.p = s.targetP
    primed = L.track > 0
  } else {
    s.p = damp(s.p, s.targetP, PROGRESS_DAMPING, s.dt)
    if (Math.abs(s.p - s.targetP) < 1e-5) s.p = s.targetP
  }
  s.t = easeProgress(s.p)

  setDiscrete(beatIndexAt(s.t))
}

/**
 * The t the 3D scene is posed at: continuous normally; under reduced motion, one fixed
 * pose per beat (its center), so camera and atmosphere never travel on their own.
 */
export function sceneProgress(reducedMotion: boolean): number {
  return reducedMotion ? beatCenter(scrollStore.beatIndex) : scrollStore.t
}

/* ---------------------------------------------------------------- */
/* Layout                                                            */
/* ---------------------------------------------------------------- */

/**
 * Re-measure the hero. If the track length changed (resize, rotate), move the scroll
 * position so the visitor keeps the same progress p, instead of jumping to wherever
 * the old pixel offset now lands.
 */
export function measureHero(hero: HTMLElement, stage: HTMLElement | null): void {
  const L = heroLayout
  const old = { heroTop: L.heroTop, track: L.track }

  L.heroTop = hero.offsetTop
  L.heroHeight = hero.offsetHeight
  L.stageHeight = stage ? stage.offsetHeight : 0
  L.track = stage ? Math.max(0, L.heroHeight - L.stageHeight) : 0

  const lenis = rig.lenis
  if (!lenis || old.track <= 0 || L.track <= 0) return
  if (old.track === L.track && old.heroTop === L.heroTop) return

  const scroll = lenis.animatedScroll
  const oldEnd = old.heroTop + old.track
  const next =
    scroll <= oldEnd
      ? L.heroTop + ((scroll - old.heroTop) / old.track) * L.track // keep p
      : scroll + (L.heroTop + L.track - oldEnd) // keep distance past the hero
  lenis.resize()
  lenis.scrollTo(next, { immediate: true, force: true })
}

/* ---------------------------------------------------------------- */
/* Discrete state for React                                          */
/* ---------------------------------------------------------------- */

const listeners = new Set<() => void>()

function setDiscrete(beatIndex: number): void {
  const s = scrollStore
  if (s.beatIndex === beatIndex) return
  s.beatIndex = beatIndex
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useBeatIndex = (): number => useSyncExternalStore(subscribe, () => scrollStore.beatIndex)
