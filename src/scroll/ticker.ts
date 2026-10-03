// The single animation ticker. ScrollRig owns the one requestAnimationFrame loop;
// everything that animates (beat DOM styles, the WebGL render, the debug HUD)
// registers here and runs in priority order right after the scroll state updates.

export type FrameCallback = (time: number, dt: number) => void

interface Entry {
  cb: FrameCallback
  priority: number
}

// Copy-on-write so a callback may unsubscribe while the list is being iterated.
let entries: readonly Entry[] = []

/** Lower priority runs first. Returns an unsubscribe function. */
export function onFrame(cb: FrameCallback, priority = 0): () => void {
  const entry: Entry = { cb, priority }
  entries = [...entries, entry].sort((a, b) => a.priority - b.priority)
  return () => {
    entries = entries.filter((e) => e !== entry)
  }
}

export function runFrameCallbacks(time: number, dt: number): void {
  const list = entries
  for (let i = 0; i < list.length; i++) list[i]!.cb(time, dt)
}

/** Standard priorities, so ordering is readable at the call sites. */
export const FRAME_PRIORITY = {
  dom: 0,
  scene: 10,
  hud: 100,
} as const
