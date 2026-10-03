// Environment detection, evaluated once at startup unless noted.

import { useSyncExternalStore } from 'react'

const params = new URLSearchParams(window.location.search)

/** ?debug=1 opens the debug HUD on load. */
export const DEBUG_ON_LOAD = params.get('debug') === '1'

/** ?nogl=1 forces the no-WebGL fallback, for testing it. */
const FORCE_NO_WEBGL = params.get('nogl') === '1'

/** ?reduced=1 forces reduced-motion mode, for testing it. */
const FORCE_REDUCED = params.get('reduced') === '1'

/**
 * The summit's glass (summit/liquidGlass.ts), for testing each strength in Chrome:
 * ?glass=frosted turns the refraction off, leaving the CSS-only glass that Firefox and
 * Safari get; ?glass=opaque gives near-opaque dark panels.
 */
const GLASS = params.get('glass')
export const FORCE_FROSTED_GLASS = GLASS === 'frosted'
export const FORCE_OPAQUE_GLASS = GLASS === 'opaque'

/**
 * Phones and tablets: lower terrain resolution and DPR. Keyed to the device, not the window:
 * a touch-only device (no hover, coarse pointer) or a phone-sized screen. A narrow desktop
 * window or a small laptop screen (1280x720) keeps full quality.
 */
export const IS_MOBILE =
  window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
  Math.min(window.screen.width, window.screen.height) < 500

/**
 * three.js needs WebGL 2. Probe it once with a throwaway canvas and release the
 * context immediately so it does not count against the browser's context limit.
 */
export function webglAvailable(): boolean {
  if (FORCE_NO_WEBGL) return false
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

function subscribeReduced(cb: () => void): () => void {
  reducedQuery.addEventListener('change', cb)
  return () => reducedQuery.removeEventListener('change', cb)
}

/** Live prefers-reduced-motion (or ?reduced=1). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, () => FORCE_REDUCED || reducedQuery.matches)
}
