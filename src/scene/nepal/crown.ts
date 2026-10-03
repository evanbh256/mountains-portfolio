// The rhododendron crown's shape, shared by the tree geometry, the blossoms placed on its
// skin, the copy check, and the prayer-flag strings tied into it. Pure maths, no imports
// beyond the tree's proportions, so the flag plan can use it without pulling in the flora
// plan (which itself reads the flag plan's poles).

import { Vector3 } from 'three'
import { TREE } from './config'

/**
 * Lumpy crown profile: radius in a given unit direction, as a multiple of the base radius.
 * The crown geometry and the blossoms on its surface both use this, so blossoms sit on the
 * skin rather than floating off it.
 */
export function crownRadius(x: number, y: number, z: number): number {
  return (
    1 +
    0.28 * Math.sin(3.1 * x + 1.7) * Math.cos(2.6 * z - 0.4) +
    0.18 * Math.sin(4.3 * y + 2.2) +
    0.12 * Math.cos(5.7 * x - 2.1) * Math.sin(4.9 * y + 0.6)
  )
}

function profileExtremes(): { min: number; max: number } {
  let min = Infinity
  let max = 0
  const n = 2000
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(1 - y * y)
    const a = i * 2.399963
    const v = crownRadius(r * Math.cos(a), y, r * Math.sin(a))
    min = Math.min(min, v)
    max = Math.max(max, v)
  }
  return { min, max }
}

/**
 * The profile at its narrowest and widest, over every direction. A tree's yaw is random, so
 * anything that has to be inside the crown whichever way it faces uses the minimum, and
 * anything that has to be clear of it uses the maximum.
 */
export const CROWN_PROFILE = profileExtremes()

export interface Crown {
  center: Vector3
  /** Base radii before the profile: across and up. */
  across: number
  up: number
}

/** The crown of a rhododendron standing at `base` at `scale`. */
export function crownOf(base: Vector3, scale: number): Crown {
  const r = TREE.crownRadius * scale
  return {
    center: base.clone().setY(base.y + TREE.crownY * scale),
    across: r * TREE.crownSpread,
    up: r * TREE.crownFlatten,
  }
}

/**
 * How far out of the crown a point is, as a fraction of the crown's reach in that direction:
 * below 1 it is inside. `profile` picks which bound of the lumpy skin to test against.
 */
export function crownReach(crown: Crown, point: Vector3, profile: number): number {
  const x = (point.x - crown.center.x) / crown.across
  const y = (point.y - crown.center.y) / crown.up
  const z = (point.z - crown.center.z) / crown.across
  return Math.hypot(x, y, z) / profile
}
