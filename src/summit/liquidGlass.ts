// Liquid glass: real refraction for the summit's glass (Chromium only).
//
// The glass is modelled as a slab with a rounded rim. Across the rim the surface curves down
// to the edge like a squircle, and light passing through that curve bends toward the centre,
// so the scene behind the rim is pulled inward and warps around the shape; the flat middle
// lets it through untouched. That is what the displacement map below encodes, one pixel per
// point of the element.
//
// The map drives an SVG feDisplacementMap applied through `backdrop-filter: url(#...)`, which
// only Chromium supports. Everywhere else nothing here runs, and summit.css's glass is the
// same clear glass without the bending.
//
// Chromium runs an SVG filter in a backdrop far more slowly than its own CSS filter functions.
// Measured on a 540x700 panel at DPR 1.5: about 11ms a frame with the blur, the colour and the
// rim light all inside the SVG filter, 1-3ms with the displacement alone. So the SVG filter
// does the one thing CSS cannot, the bending, and nothing else. Everything else the glass
// looks like (edge, highlight, fills) is a token in summit.css. Keep it that way; every
// primitive added to the filter is paid for on every frame.

import { useEffect, type RefObject } from 'react'
import { FORCE_FROSTED_GLASS, FORCE_OPAQUE_GLASS } from '../lib/env'

export interface LiquidGlassOptions {
  /** Width of the curved rim, px: where the light bends. Clamped inside the corner radius. */
  bezel: number
  /** Largest sideways shift of the scene at the rim, px, at the full bezel width. */
  depth: number
}

/**
 * A panel: the rim fills the corner radius, and the scene bends a little way in across it.
 * The summit panels and the climb's boxes (hero/Beat.tsx) both use it.
 */
export const PANEL_GLASS: LiquidGlassOptions = { bezel: 38, depth: 40 }

/** The rail, and the music pill (ui/MusicPill.tsx): the same glass, a narrower rim for a slimmer shape. */
export const RAIL_GLASS: LiquidGlassOptions = { bezel: 22, depth: 22 }

/** The backdrop: the bend and nothing else. The glass is clear: the scene is neither blurred nor recoloured. */
const backdropFor = (id: string) => `url(#${id})`

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Glass refractive index. */
const IOR = 1.5

/** Rim height as a fraction of its width: how steeply the edge curves. */
const RIM_HEIGHT = 0.6

/** Maps are rendered at this fraction of the element's size; they are smooth, and upscale cleanly. */
const MAP_SCALE = 0.5

type UserAgentData = { brands: { brand: string }[] }

const LIQUID_GLASS_SUPPORTED =
  !FORCE_FROSTED_GLASS &&
  !FORCE_OPAQUE_GLASS &&
  Boolean(
    (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData?.brands.some(
      (b) => b.brand === 'Chromium',
    ),
  )

/** Convex squircle: the rim's height across its width, 0 at the outer edge, 1 at the plateau. */
const surface = (x: number) => Math.pow(1 - Math.pow(1 - x, 4), 0.25)

/**
 * Sideways shift across the rim, 0..1, from Snell's law: a vertical ray meets the curved
 * surface, bends, and travels through the glass beneath it. Zero at the very edge (no glass
 * to travel through) and on the plateau (no curve), strongest just inside the edge.
 */
const PROFILE = (() => {
  const n = 256
  const out = new Float32Array(n)
  let max = 0
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n
    const e = 0.5 / n
    const slope = ((surface(Math.min(1, x + e)) - surface(Math.max(0, x - e))) / (2 * e)) * RIM_HEIGHT
    const incidence = Math.atan(slope)
    const refracted = Math.asin(Math.sin(incidence) / IOR)
    const shift = Math.tan(incidence - refracted) * surface(x)
    out[i] = shift
    if (shift > max) max = shift
  }
  for (let i = 0; i < n; i++) out[i]! /= max
  return out
})()

/** The displacement map, as a PNG data URL. */
function renderMap(w: number, h: number, radius: number, bezel: number): string {
  const cw = Math.max(1, Math.round(w * MAP_SCALE))
  const ch = Math.max(1, Math.round(h * MAP_SCALE))
  const disp = new ImageData(cw, ch)
  const hw = w / 2
  const hh = h / 2
  const r = Math.min(radius, hw, hh)

  for (let j = 0; j < ch; j++) {
    const py = (j + 0.5) / MAP_SCALE - hh
    for (let i = 0; i < cw; i++) {
      const px = (i + 0.5) / MAP_SCALE - hw
      const k = (j * cw + i) * 4
      // Distance to the rounded rectangle's edge, and the outward normal there.
      const qx = Math.abs(px) - (hw - r)
      const qy = Math.abs(py) - (hh - r)
      let d: number
      let nx: number
      let ny: number
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1
        d = r - l
        nx = (qx / l) * Math.sign(px)
        ny = (qy / l) * Math.sign(py)
      } else if (qx > qy) {
        d = r - qx
        nx = Math.sign(px)
        ny = 0
      } else {
        d = r - qy
        nx = 0
        ny = Math.sign(py)
      }

      const x = d / bezel
      if (d < 0 || x >= 1) {
        disp.data[k] = 128
        disp.data[k + 1] = 128
        disp.data[k + 2] = 128
        disp.data[k + 3] = 255
        continue
      }
      // Pulled inward along the normal, so the rim never samples outside the element.
      const m = PROFILE[Math.min(255, Math.floor(x * 256))]!
      disp.data[k] = Math.round(128 - nx * m * 127)
      disp.data[k + 1] = Math.round(128 - ny * m * 127)
      disp.data[k + 2] = 128
      disp.data[k + 3] = 255
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  canvas.getContext('2d')!.putImageData(disp, 0, 0)
  return canvas.toDataURL('image/png')
}

let defs: SVGDefsElement | null = null
let nextId = 0

/** One hidden <svg> holds every glass filter on the page. */
function filterHost(): SVGDefsElement {
  if (defs?.isConnected) return defs
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
  defs = document.createElementNS(SVG_NS, 'defs')
  svg.append(defs)
  document.body.append(svg)
  return defs
}

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

/**
 * Gives an element liquid glass while it is mounted: builds its filter and keeps the map
 * matched to its size and corner radius. On unmount the element goes back to the CSS glass.
 */
export function useLiquidGlass(ref: RefObject<HTMLElement | null>, options: LiquidGlassOptions): void {
  useEffect(() => {
    const el = ref.current
    if (!el || !LIQUID_GLASS_SUPPORTED) return

    const id = `liquid-glass-${++nextId}`
    const dispImage = node('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'map' })
    const displace = node('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'map',
      xChannelSelector: 'R',
      yChannelSelector: 'G',
    })
    const filter = node('filter', {
      id,
      x: 0,
      y: 0,
      filterUnits: 'userSpaceOnUse',
      primitiveUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB',
    })
    filter.append(dispImage, displace)
    const backdrop = backdropFor(id)
    filterHost().append(filter)

    let key = ''
    let idle = 0
    const render = () => {
      idle = 0
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w < 2 || h < 2) return
      const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2)
      const bezel = Math.max(4, Math.min(options.bezel, r - 1))
      const next = `${w}x${h}r${r}b${bezel}`
      if (next !== key) {
        key = next
        // A rim squeezed by a small corner bends proportionally less.
        displace.setAttribute('scale', String(2 * options.depth * (bezel / options.bezel)))
        for (const f of [filter, dispImage]) {
          f.setAttribute('width', String(w))
          f.setAttribute('height', String(h))
        }
        dispImage.setAttribute('href', renderMap(w, h, r, bezel))
      }
      el.style.backdropFilter = backdrop
      el.classList.add('is-liquid')
    }
    const schedule = () => {
      if (!idle) idle = requestIdleCallback(render, { timeout: 250 })
    }

    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    schedule()

    return () => {
      ro.disconnect()
      if (idle) cancelIdleCallback(idle)
      filter.remove()
      el.style.removeProperty('backdrop-filter')
      el.classList.remove('is-liquid')
    }
  }, [ref, options])
}
