export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/** Hermite smoothstep of x between edges e0 and e1, clamped to [0, 1]. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const k = clamp((x - e0) / (e1 - e0), 0, 1)
  return k * k * (3 - 2 * k)
}

/** Frame-rate independent exponential approach of `current` toward `target`. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}
