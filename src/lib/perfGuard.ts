// A frame-time watchdog. The quality tier in quality.ts is picked before anything renders,
// from what kind of device this is; this is the other half - what the machine turns out to
// be able to do once it is actually drawing.
//
// It only ever steps down, and only after a sustained run of slow frames, so a single hitch
// (a tab regaining focus, a shader compiling) never costs anyone detail. Each level is read
// by the thing it turns down: level 1 pulls the grass in close, level 2 drops the light
// shafts as well.

import { MAX_FRAME_DT } from '../scene/config'

/**
 * `?perf=off` pins the guard at full detail. Screenshot runs need it: several headless
 * browsers on one machine make frames genuinely slow, the guard correctly steps detail
 * down, and two capture runs then differ by however loaded the machine happened to be
 * rather than by the change under test.
 */
const PINNED = new URLSearchParams(window.location.search).get('perf') === 'off'

const WINDOW = 45
/** Frame time (s) above which a window counts as slow: about 40fps. */
const SLOW = 0.025
/** Consecutive slow windows before stepping down. */
const PATIENCE = 2

export const perf = {
  /** 0 = full detail, 1 = less grass, 2 = no light shafts either. */
  level: 0,
  /** Median frame time (s) of the last completed window, for the debug HUD. */
  median: 0,
}

const frames: number[] = []
let slowWindows = 0

export function samplePerformance(dt: number): void {
  if (PINNED || perf.level >= 2 || dt <= 0 || dt >= MAX_FRAME_DT) return
  frames.push(dt)
  if (frames.length < WINDOW) return

  frames.sort((a, b) => a - b)
  perf.median = frames[WINDOW >> 1]!
  frames.length = 0

  if (perf.median > SLOW) {
    if (++slowWindows >= PATIENCE) {
      perf.level++
      slowWindows = 0
    }
  } else {
    slowWindows = 0
  }
}
