import { useEffect, useRef, useState } from 'react'
import { BEAT_COUNT } from '../scene/config'
import { debugCounters, sceneStats } from '../lib/debug'
import { DEBUG_ON_LOAD } from '../lib/env'
import { scrollToBeat } from '../scroll/navigation'
import { beatEnvelope, type BeatEnvelope } from '../scroll/progress'
import { rig, scrollStore } from '../scroll/scrollStore'
import { FRAME_PRIORITY, onFrame } from '../scroll/ticker'
import { NepalHudSection } from './NepalHudSection'

const f =(v: number, digits = 4) => v.toFixed(digits)

/** Toggle with ?debug=1 or the D key. Readouts are written imperatively at ~10 Hz. */
export function DebugHud() {
  const [open, setOpen] = useState(DEBUG_ON_LOAD)
  const readoutRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'd' && e.key !== 'D') return
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const out = readoutRef.current
    if (!open || !out) return
    const env: BeatEnvelope = { opacity: 0, offset: 0 }
    let frames = 0
    let elapsed = 0
    let fps = 0
    let lastWrite = -1

    return onFrame((time, dt) => {
      frames++
      elapsed += dt
      if (elapsed >= 0.5) {
        fps = frames / elapsed
        frames = 0
        elapsed = 0
      }
      if (time - lastWrite < 0.1) return
      lastWrite = time

      const s = scrollStore
      let visible = 0
      for (let i = 0; i < BEAT_COUNT; i++) if (beatEnvelope(s.t, i, env).opacity > 0) visible++

      out.textContent = [
        `p target   ${f(s.targetP)}`,
        `p smooth   ${f(s.p)}`,
        `t          ${f(s.t)}`,
        `beat       ${s.beatIndex + 1} / ${BEAT_COUNT}   visible ${visible}`,
        `scroll     ${f(s.scroll, 1)} px   v ${f(s.velocity, 2)}`,
        `camera     ${f(sceneStats.camX, 1)}, ${f(sceneStats.camY, 1)}, ${f(sceneStats.camZ, 1)}`,
        `clearance  ${f(sceneStats.clearance, 2)}`,
        `fog        ${f(sceneStats.fogDensity)}`,
        `frameloop  ${sceneStats.rendering ? 'on' : 'off'}`,
        `fps        ${f(fps, 0)}   dpr ${f(sceneStats.dpr, 2)}`,
        `triangles  ${sceneStats.triangles}   calls ${sceneStats.calls}`,
        `lenis      ${debugCounters.lenisInstances}   tickers ${debugCounters.tickers}`,
        `commits    ${debugCounters.reactCommits}   reduced ${rig.reducedMotion ? 'yes' : 'no'}`,
      ].join('\n')
    }, FRAME_PRIORITY.hud)
  }, [open])

  if (!open) return null

  return (
    <aside
      aria-label="Debug readouts"
      className="fixed top-3 right-3 z-20 w-[21rem] max-w-[calc(100vw-1.5rem)] rounded-lg bg-ink/88 p-3 font-mono text-[11px] leading-[1.45] text-white shadow-lg"
    >
      <pre ref={readoutRef} className="m-0 whitespace-pre" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Array.from({ length: BEAT_COUNT }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => scrollToBeat(i)}
            className="rounded border border-white/30 px-2 py-0.5 hover:bg-white/15"
          >
            Beat {i + 1}
          </button>
        ))}
      </div>
      <NepalHudSection />
    </aside>
  )
}
