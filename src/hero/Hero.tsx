import { useLayoutEffect, useRef } from 'react'
import { BEATS, SITE } from '../content/content'
import { BEAT_COUNT, BEAT_SLIDE_PX, HERO_SCREENS, TEXT_BEAT_COUNT } from '../scene/config'
import { beatEnvelope, type BeatEnvelope } from '../scroll/progress'
import { measureHero, scrollStore, useBeatIndex } from '../scroll/scrollStore'
import { FRAME_PRIORITY, onFrame } from '../scroll/ticker'
import { Beat } from './Beat'

if (BEATS.length !== BEAT_COUNT) {
  throw new Error(`content.ts has ${BEATS.length} beats but BEAT_COUNT is ${BEAT_COUNT}`)
}
// The Nepal layer keeps its props clear of the lower-left copy for exactly these beats.
if (BEATS.some((beat, i) => (beat.place !== 'top-right') !== i < TEXT_BEAT_COUNT)) {
  throw new Error(`content.ts: only the first ${TEXT_BEAT_COUNT} beats (TEXT_BEAT_COUNT) may sit lower left`)
}

interface HeroProps {
  /** false = WebGL fallback: the track collapses and beats become ordinary sections. */
  pinned: boolean
  reducedMotion: boolean
}

/**
 * The hero track: HERO_SCREENS x 100svh tall, with a sticky one-screen stage holding the
 * climb beats. The page ends where the climb does, with the camera parked at the summit;
 * the resume there is the rail and panels in summit/SummitNav.tsx, outside the scroller.
 * The hero is transparent; the fixed canvas shows through it.
 */
export function Hero({ pinned, reducedMotion }: HeroProps) {
  const heroRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const beatRefs = useRef<(HTMLDivElement | null)[]>([])
  const boxRefs = useRef<(HTMLElement | null)[]>([])
  const active = useBeatIndex() // re-renders only when the beat changes

  // Cache hero geometry; re-measure on resize (never read layout per frame).
  useLayoutEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    const stage = pinned ? stageRef.current : null
    const measure = () => measureHero(hero, stage)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(hero)
    if (stage) ro.observe(stage)
    return () => ro.disconnect()
  }, [pinned])

  // Beat opacity/slide, written imperatively from the shared ticker: the text block and its
  // glass box (each on the element itself; see BeatBox) move as one.
  useLayoutEffect(() => {
    const els = beatRefs.current
    const boxes = boxRefs.current
    if (!pinned) {
      for (const el of [...els, ...boxes]) {
        el?.style.removeProperty('opacity')
        el?.style.removeProperty('visibility')
        el?.style.removeProperty('transform')
      }
      return
    }
    const lastOpacity = els.map(() => -1)
    const lastY = els.map(() => Number.NaN)
    const env: BeatEnvelope = { opacity: 0, offset: 0 }
    const fade = (el: HTMLElement, o: number) => {
      el.style.opacity = String(o)
      el.style.visibility = o > 0 ? 'visible' : 'hidden'
      el.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
    }
    const slide = (el: HTMLElement, y: number) => {
      el.style.transform = y === 0 ? 'none' : `translate3d(0, ${y}px, 0)`
    }

    const apply = () => {
      const t = scrollStore.t
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        if (!el) continue
        const box = boxes[i]
        beatEnvelope(t, i, env)
        const o = Math.round(env.opacity * 1000) / 1000
        const y = reducedMotion ? 0 : Math.round(env.offset * BEAT_SLIDE_PX * 10) / 10
        if (o !== lastOpacity[i]) {
          fade(el, o)
          if (box) fade(box, o)
          lastOpacity[i] = o
        }
        if (y !== lastY[i]) {
          slide(el, y)
          if (box) slide(box, y)
          lastY[i] = y
        }
      }
    }
    apply() // before first paint, so beats never flash on top of each other
    return onFrame(apply, FRAME_PRIORITY.dom)
  }, [pinned, reducedMotion])

  const beats = BEATS.map((beat, i) => (
    <Beat
      key={beat.id}
      ref={(el) => {
        beatRefs.current[i] = el
      }}
      boxRef={(el) => {
        boxRefs.current[i] = el
      }}
      beat={beat}
      index={i}
      active={!pinned || i === active}
      stacked={pinned}
    />
  ))

  return (
    <section
      id="hero"
      ref={heroRef}
      aria-label={SITE.heroLabel}
      className="relative"
      style={pinned ? { height: `${HERO_SCREENS * 100}svh` } : undefined}
    >
      {pinned ? (
        <div ref={stageRef} className="sticky top-0 h-svh overflow-hidden">
          {beats}
        </div>
      ) : (
        <>
          {beats}
          {/* No summit without WebGL: an empty last screen stands in for it, where the rail
              and panels can open clear of the last beat's copy. */}
          <div aria-hidden="true" className="h-svh" />
        </>
      )}
    </section>
  )
}
