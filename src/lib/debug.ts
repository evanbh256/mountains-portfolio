// Debug-only counters. Kept on globalThis so they survive HMR re-evaluating this module,
// which is exactly when we want to prove there is still one Lenis and one ticker.

export interface DebugCounters {
  lenisInstances: number
  tickers: number
  reactCommits: number
}

const g = globalThis as typeof globalThis & { __heroDebug?: DebugCounters }

export const debugCounters: DebugCounters = (g.__heroDebug ??= {
  lenisInstances: 0,
  tickers: 0,
  reactCommits: 0,
})

/** Dev-only handles for console/automation checks (set by SceneRoot in DEV builds). */
export const debugHandles: { scene: unknown; gl: unknown; camera: unknown } = {
  scene: null,
  gl: null,
  camera: null,
}

/** Per-frame scene readouts written by the scene, read by the HUD. */
export const sceneStats = {
  camX: 0,
  camY: 0,
  camZ: 0,
  lookX: 0,
  lookY: 0,
  lookZ: 0,
  /** Camera height above the rendered ground directly below it. */
  clearance: 0,
  fogDensity: 0,
  rendering: false,
  triangles: 0,
  calls: 0,
  dpr: 0,
}
