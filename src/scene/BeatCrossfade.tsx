import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { beatEnvelope, type BeatEnvelope } from '../scroll/progress'
import { scrollStore } from '../scroll/scrollStore'
import { FRAME_PRIORITY, onFrame } from '../scroll/ticker'
import { createAtmosphereState, sampleAtmosphere } from './atmosphere'

/**
 * Reduced motion only. The camera holds one pose per beat instead of travelling, so the
 * scene crossfades: the canvas follows the active beat's envelope (the same curve as the
 * text, 0 at every beat boundary, which is exactly when the pose switches) over a backdrop
 * of the fog color at the real t. Pure function of scroll, no time.
 */
export function BeatCrossfade() {
  const canvas = useThree((s) => s.gl.domElement)

  useEffect(() => {
    const backdrop = canvas.parentElement
    if (!backdrop) return
    const env: BeatEnvelope = { opacity: 1, offset: 0 }
    const atm = createAtmosphereState()
    let lastOpacity = -1
    let lastHex = -1

    const off = onFrame(() => {
      const s = scrollStore
      const opacity = Math.round(beatEnvelope(s.t, s.beatIndex, env).opacity * 1000) / 1000
      if (opacity !== lastOpacity) {
        canvas.style.opacity = String(opacity)
        lastOpacity = opacity
      }
      const hex = sampleAtmosphere(s.t, atm).fog.getHex()
      if (hex !== lastHex) {
        backdrop.style.backgroundColor = `#${hex.toString(16).padStart(6, '0')}`
        lastHex = hex
      }
    }, FRAME_PRIORITY.scene + 1)

    return () => {
      off()
      canvas.style.removeProperty('opacity')
      backdrop.style.removeProperty('background-color')
    }
  }, [canvas])

  return null
}
