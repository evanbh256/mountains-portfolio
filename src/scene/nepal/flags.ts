// Feature switches for the Nepali detail layer. Every feature is additive: with every flag
// off, nothing from src/scene/nepal is mounted and no class or label reaches the DOM.
//
// Plain module state with a tiny subscribe/notify, read by React through
// useSyncExternalStore (the same pattern as scrollStore). No three.js import here, so
// UI code can read the flags without pulling the scene chunk in.

import { useSyncExternalStore } from 'react'

export interface NepalFlags {
  prayerFlags: boolean
  chorten: boolean
  trail: boolean
  rhododendron: boolean
  shrubs: boolean
  uiAccents: boolean
}

export const NEPAL_FLAG_KEYS: (keyof NepalFlags)[] = [
  'prayerFlags',
  'chorten',
  'trail',
  'rhododendron',
  'shrubs',
  'uiAccents',
]

/** ?nepal=0 starts with every feature off (for before/after comparisons). */
const START_ON = new URLSearchParams(window.location.search).get('nepal') !== '0'

/** Current switches. Treat as read-only; change them through setNepalFlag. */
export const NEPAL: Readonly<NepalFlags> = {
  prayerFlags: START_ON,
  chorten: START_ON,
  trail: START_ON,
  rhododendron: START_ON,
  shrubs: START_ON,
  uiAccents: START_ON,
}

let snapshot: Readonly<NepalFlags> = NEPAL
const listeners = new Set<() => void>()

export function setNepalFlag(key: keyof NepalFlags, value: boolean): void {
  if (snapshot[key] === value) return
  snapshot = { ...snapshot, [key]: value }
  Object.assign(NEPAL, snapshot)
  listeners.forEach((l) => l())
}

export function setAllNepalFlags(value: boolean): void {
  for (const key of NEPAL_FLAG_KEYS) setNepalFlag(key, value)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Re-renders only when a switch changes. */
export const useNepalFlags = (): Readonly<NepalFlags> => useSyncExternalStore(subscribe, () => snapshot)
