// One low-poly chorten, built once as a single vertex-colored geometry (one draw call for
// every chorten through instancing). Unscaled: base top at y = 0, finial tip at y = 7.35.
// Plain forms only: no eyes, figures or inscriptions.

import { BoxGeometry, BufferAttribute, BufferGeometry, Color, LatheGeometry, Vector2 } from 'three'
import { mulberry32 } from '../noise'
import { CHORTEN_UNIT_HEIGHT, GOLD, STONE, WHITEWASH } from './config'

/** Depth the stone base continues below y = 0, so a sloped site never shows a seam. */
export const CHORTEN_SKIRT = 6.5
export const CHORTEN_BASE_HALF = 2.7
/** Half width of the lowest whitewash step, and the stone course height it sits on. */
export const CHORTEN_STEP_HALF = 2.1
export const CHORTEN_STONE_TOP = 0.5
/** Unscaled height, base top to finial tip. Owned by config.ts so world/scale can size it. */
export const CHORTEN_HEIGHT = CHORTEN_UNIT_HEIGHT

interface Part {
  geometry: BufferGeometry
  color: string
  /** Per-vertex brightness jitter, +-. */
  jitter: number
}

function box(w: number, y0: number, y1: number, color: string, jitter: number): Part {
  return { geometry: new BoxGeometry(w, y1 - y0, w).translate(0, (y0 + y1) / 2, 0), color, jitter }
}

function lathe(points: [number, number][], segments: number, color: string, jitter: number): Part {
  return {
    geometry: new LatheGeometry(
      points.map(([r, y]) => new Vector2(r, y)),
      segments,
    ),
    color,
    jitter,
  }
}

/** 13 stacked rings tapering to the parasol (the chuksum khorlo). */
function spireProfile(y0: number, y1: number, r0: number, r1: number): [number, number][] {
  const rings = 13
  const hh = (y1 - y0) / rings
  const points: [number, number][] = [[0, y0]]
  for (let i = 0; i < rings; i++) {
    const r = r0 + ((r1 - r0) * i) / (rings - 1)
    const y = y0 + i * hh
    points.push([r * 0.84, y], [r, y + hh * 0.4], [r * 0.84, y + hh])
  }
  return points
}

export function buildChortenGeometry(): BufferGeometry {
  const parts: Part[] = [
    // Low stone wall base, running CHORTEN_SKIRT below grade.
    box(CHORTEN_BASE_HALF * 2, -CHORTEN_SKIRT, CHORTEN_STONE_TOP, STONE, 0.09),
    // Stepped square plinth.
    box(CHORTEN_STEP_HALF * 2, CHORTEN_STONE_TOP, 1.0, WHITEWASH, 0.03),
    box(3.7, 1.0, 1.45, WHITEWASH, 0.03),
    box(3.2, 1.45, 1.85, WHITEWASH, 0.03),
    // Dome (bumpa), widest at the shoulder.
    lathe(
      [
        [0, 1.85],
        [1.3, 1.85],
        [1.48, 2.15],
        [1.55, 2.6],
        [1.45, 3.1],
        [1.15, 3.55],
        [0.72, 3.85],
        [0, 3.9],
      ],
      12,
      WHITEWASH,
      0.03,
    ),
    // Square harmika and its cornice.
    box(1.05, 3.88, 4.45, WHITEWASH, 0.03),
    box(1.3, 4.45, 4.59, WHITEWASH, 0.03),
    // Gold spire, parasol and finial.
    lathe(spireProfile(4.59, 6.45, 0.46, 0.17), 10, GOLD, 0.04),
    lathe(
      [
        [0.14, 6.45],
        [0.62, 6.55],
        [0.58, 6.63],
        [0.12, 6.72],
      ],
      10,
      GOLD,
      0.04,
    ),
    lathe(
      [
        [0.05, 6.72],
        [0.15, 6.8],
        [0.17, 6.9],
        [0.13, 7.0],
        [0.05, 7.05],
        [0, CHORTEN_HEIGHT],
      ],
      8,
      GOLD,
      0.04,
    ),
  ]

  let vertexCount = 0
  let indexCount = 0
  for (const p of parts) {
    vertexCount += p.geometry.getAttribute('position').count
    indexCount += p.geometry.getIndex()!.count
  }

  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const index = new Uint32Array(indexCount)
  const rand = mulberry32(5)
  const base = new Color()
  let v = 0
  let w = 0
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position')
    const idx = p.geometry.getIndex()!
    base.set(p.color)
    for (let i = 0; i < pos.count; i++) {
      const k = 1 + (rand() * 2 - 1) * p.jitter
      positions.set([pos.getX(i), pos.getY(i), pos.getZ(i)], (v + i) * 3)
      colors.set([base.r * k, base.g * k, base.b * k], (v + i) * 3)
    }
    for (let i = 0; i < idx.count; i++) index[w++] = idx.getX(i) + v
    v += pos.count
    p.geometry.dispose()
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}
