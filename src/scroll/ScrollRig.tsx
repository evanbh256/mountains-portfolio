import Lenis from 'lenis'
import { useEffect, useRef, type ReactNode } from 'react'
import { debugCounters } from '../lib/debug'
import { rig, scrollStore, updateScrollState } from './scrollStore'
import { runFrameCallbacks } from './ticker'

interface ScrollRigProps {
  reducedMotion: boolean
  children: ReactNode
}

const LINE = 60
const FORM_FIELD = /^(INPUT|TEXTAREA|SELECT)$/

/**
 * Keyboard scrolling for #scroll-root through Lenis, wherever focus is, so it never depends
 * on which element the browser would pick for native keyboard scrolling. Form fields keep
 * their keys, Space on a button still presses it, and anything inside [data-own-scroll]
 * (the summit panels) scrolls itself natively.
 */
function scrollFromKeyboard(e: KeyboardEvent, wrapper: HTMLElement, lenis: Lenis, immediate: boolean): void {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
  const target = e.target as HTMLElement | null
  if (target && (target.isContentEditable || FORM_FIELD.test(target.tagName))) return
  if (target?.closest('[data-own-scroll]')) return
  if (e.key === ' ' && target?.tagName === 'BUTTON') return
  const page = wrapper.clientHeight * 0.9
  const from = lenis.targetScroll
  let next: number
  switch (e.key) {
    case 'ArrowDown':
      next = from + LINE
      break
    case 'ArrowUp':
      next = from - LINE
      break
    case 'PageDown':
      next = from + page
      break
    case 'PageUp':
      next = from - page
      break
    case ' ':
      next = from + (e.shiftKey ? -page : page)
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = lenis.limit
      break
    default:
      return
  }
  e.preventDefault()
  lenis.scrollTo(next, { immediate })
}

/**
 * #scroll-root is the only scrolling element on the page (html/body never scroll).
 * This component owns the single Lenis instance attached to it and the single
 * requestAnimationFrame loop that drives everything else:
 *
 *   lenis.raf -> scroll state (p, t, beat) -> frame callbacks (DOM, WebGL, HUD)
 *
 * Both are created in one effect and torn down in its cleanup, so StrictMode's double
 * mount and HMR always leave exactly one of each (the debug HUD counts them).
 */
export function ScrollRig({ reducedMotion, children }: ScrollRigProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = rootRef.current
    const content = contentRef.current
    if (!wrapper || !content) return

    rig.reducedMotion = reducedMotion
    const lenis = new Lenis({
      wrapper,
      content,
      eventsTarget: wrapper,
      smoothWheel: !reducedMotion,
      syncTouch: false, // native touch scrolling on touch devices
      autoRaf: false, // driven by the ticker below
      autoResize: true, // recompute limits when wrapper or content resize
      anchors: false, // nothing on the page links to a "#id" any more
    })
    rig.lenis = lenis
    debugCounters.lenisInstances++

    let raf = 0
    let last = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = last ? (now - last) / 1000 : 1 / 60
      last = now
      lenis.raf(now)
      updateScrollState(lenis.scroll, lenis.velocity, now / 1000, dt, !reducedMotion)
      runFrameCallbacks(now / 1000, scrollStore.dt)
    }
    raf = requestAnimationFrame(tick)
    debugCounters.tickers++

    const onKeyDown = (e: KeyboardEvent) => scrollFromKeyboard(e, wrapper, lenis, reducedMotion)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      cancelAnimationFrame(raf)
      debugCounters.tickers--
      lenis.destroy()
      if (rig.lenis === lenis) rig.lenis = null
      debugCounters.lenisInstances--
    }
  }, [reducedMotion])

  return (
    <div id="scroll-root" ref={rootRef}>
      <div id="scroll-content" ref={contentRef}>
        {children}
      </div>
    </div>
  )
}
