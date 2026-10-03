// Tileable soft-noise cloud texture, generated once into a small canvas.

import { CanvasTexture, RepeatWrapping } from 'three'
import { smoothstep } from '../lib/math'
import { CLOUD_COVER, CLOUD_TEXTURE_SIZE } from './config'
import { mulberry32 } from './noise'

// Lattice periods (cells per tile) and weights. Every period divides the tile, so every
// octave wraps exactly and the sum tiles seamlessly.
const OCTAVES: [period: number, weight: number][] = [
  [4, 1],
  [8, 0.5],
  [16, 0.25],
  [32, 0.125],
]

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/**
 * Puff shape in [0, 1] written to R, G and B with alpha fixed at 1. Materials read it as an
 * alphaMap or aoMap (both sample channels, not alpha), so no canvas premultiplication fringes.
 */
export function createCloudTexture(seed = 11): CanvasTexture {
  const size = CLOUD_TEXTURE_SIZE
  const rand = mulberry32(seed)
  const lattices = OCTAVES.map(([period]) => Float32Array.from({ length: period * period }, rand))
  const field = new Float32Array(size * size)
  const norm = OCTAVES.reduce((sum, [, w]) => sum + w, 0)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0
      for (let o = 0; o < OCTAVES.length; o++) {
        const [period, weight] = OCTAVES[o]!
        const lattice = lattices[o]!
        const fx = (x / size) * period
        const fy = (y / size) * period
        const x0 = Math.floor(fx)
        const y0 = Math.floor(fy)
        const x1 = (x0 + 1) % period
        const y1 = (y0 + 1) % period
        const tx = fade(fx - x0)
        const ty = fade(fy - y0)
        const a = lattice[y0 * period + x0]!
        const b = lattice[y0 * period + x1]!
        const c = lattice[y1 * period + x0]!
        const d = lattice[y1 * period + x1]!
        n += weight * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty)
      }
      field[y * size + x] = n / norm
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(size, size)
  for (let i = 0; i < field.length; i++) {
    const v = Math.round(255 * smoothstep(CLOUD_COVER[0], CLOUD_COVER[1], field[i]!))
    image.data[i * 4] = v
    image.data[i * 4 + 1] = v
    image.data[i * 4 + 2] = v
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}
