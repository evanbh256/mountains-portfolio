import { useCallback, useEffect, useRef, useState } from 'react'
import { RESUME, RESUME_UI, sectionFromHash, type ResumeSection, type SectionId } from '../content/resume'
import { smoothstep } from '../lib/math'
import { rig, scrollStore } from '../scroll/scrollStore'
import { FRAME_PRIORITY, onFrame } from '../scroll/ticker'
import { FORCE_OPAQUE_GLASS } from '../lib/env'
import { RAIL_REVEAL } from './layout'
import { useLiquidGlass, type LiquidGlassOptions } from './liquidGlass'
import { SectionBody } from './SectionBody'
import './summit.css'

/** A panel: the rim fills the corner radius, and the scene bends a little way in across it. */
const PANEL_GLASS: LiquidGlassOptions = { bezel: 38, depth: 40 }

/** The rail: the same glass, a narrower rim for a slimmer shape. */
const RAIL_GLASS: LiquidGlassOptions = { bezel: 22, depth: 22 }

interface SummitNavProps {
  /** false = the no-WebGL fallback: no climb, the page is plain sections. */
  pinned: boolean
  reducedMotion: boolean
}

const panelId = (id: SectionId) => `summit-panel-${id}`

/** How far the rail has faded in, 0..1. */
function revealNow(pinned: boolean): number {
  if (pinned) return smoothstep(RAIL_REVEAL[0], RAIL_REVEAL[1], scrollStore.t)
  // Without the climb the page ends on an empty screen (Hero), and the rail comes in over
  // the last half of it.
  const lenis = rig.lenis
  if (!lenis) return 0
  const vh = window.innerHeight
  return smoothstep(lenis.limit - 0.5 * vh, lenis.limit - 0.1 * vh, scrollStore.scroll)
}

/** Scroll to where the rail lives: the parked summit, or the fallback's last screen. */
function scrollToEnd(): void {
  const lenis = rig.lenis
  lenis?.scrollTo(lenis.limit, { immediate: true, force: true })
}

/** replaceState, not a hash assignment: no history entry per panel, and no hashchange. */
function setHash(id: SectionId | null): void {
  const url = id ? `#${id}` : window.location.pathname + window.location.search
  window.history.replaceState(window.history.state, '', url)
}

interface PanelProps {
  section: ResumeSection
  open: boolean
  onClose: () => void
  bodyRef: (el: HTMLDivElement | null) => void
}

/** One section's glass panel. Closed panels stay mounted, inert and hidden. */
function Panel({ section, open, onClose, bodyRef }: PanelProps) {
  const ref = useRef<HTMLElement>(null)
  useLiquidGlass(ref, PANEL_GLASS)
  const id = panelId(section.id)
  return (
    <section
      ref={ref}
      id={id}
      role="dialog"
      aria-labelledby={`${id}-title`}
      className="summit-panel glass"
      data-open={open}
      inert={!open}
    >
      <header className="glass-head">
        <h2 id={`${id}-title`} className="glass-title">
          {section.title}
        </h2>
        <p lang="ne" className="glass-ne">
          {section.devanagari}
        </p>
        <button type="button" className="glass-close glass-inset" aria-label={`${RESUME_UI.close} ${section.title}`} onClick={onClose}>
          {/* Tabler Icons "x" (MIT). */}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div ref={bodyRef} className="glass-body" tabIndex={-1}>
        <SectionBody section={section} />
      </div>
    </section>
  )
}

/**
 * The summit's resume: a rail of section names down the left edge and one glass panel
 * beside it. It sits outside the scroller, so opening a panel never moves the page or the
 * camera; the rail only fades in once the camera crests the summit (RAIL_REVEAL), and
 * leaving the summit closes whatever is open.
 *
 * All seven panels stay mounted so every rail button's aria-controls points at a real
 * element and a switch can cross-fade. Closed ones are inert and hidden.
 */
export function SummitNav({ pinned, reducedMotion }: SummitNavProps) {
  const [open, setOpen] = useState<SectionId | null>(null)
  const [live, setLive] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const panelsRef = useRef<HTMLDivElement>(null)
  const buttons = useRef(new Map<SectionId, HTMLButtonElement>())
  const bodies = useRef(new Map<SectionId, HTMLDivElement>())
  useLiquidGlass(navRef, RAIL_GLASS)

  const show = useCallback((id: SectionId) => {
    setOpen(id)
    setHash(id)
  }, [])

  const close = useCallback((id: SectionId, returnFocus: boolean) => {
    setOpen(null)
    setHash(null)
    if (returnFocus) buttons.current.get(id)?.focus({ preventScroll: true })
  }, [])

  // Reveal, written from the shared ticker. React hears about it only when the rail crosses
  // half-visible, which is when it starts or stops taking input.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    let last = -1
    let isLive = false
    const apply = () => {
      const r = Math.round(revealNow(pinned) * 1000) / 1000
      if (r === last) return
      last = r
      nav.style.setProperty('--reveal', String(r))
      nav.style.visibility = r > 0 ? 'visible' : 'hidden'
      if (r >= 0.5 === isLive) return
      isLive = !isLive
      setLive(isLive)
      if (!isLive) {
        // Back down the mountain: whatever was open closes, and its hash goes with it.
        setOpen(null)
        if (sectionFromHash(window.location.hash)) setHash(null)
      }
    }
    apply()
    return onFrame(apply, FRAME_PRIORITY.dom)
  }, [pinned])

  // #experience on load (or typed into the address bar later) goes straight to the summit
  // and opens that panel.
  useEffect(() => {
    const fromHash = () => {
      const section = sectionFromHash(window.location.hash)
      if (!section) return
      scrollToEnd()
      setOpen(section.id)
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [])

  // Focus moves into the panel that opened; on a phone its pill scrolls into view.
  useEffect(() => {
    if (!open) return
    bodies.current.get(open)?.focus({ preventScroll: true })
    const list = listRef.current
    const button = buttons.current.get(open)
    if (!list || !button || list.scrollWidth <= list.clientWidth) return
    list.scrollTo({
      left: button.offsetLeft - (list.clientWidth - button.offsetWidth) / 2,
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [open, reducedMotion])

  // Esc, or a press anywhere but the rail and the panel, closes it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      close(open, true)
    }
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (panelsRef.current?.contains(target) || navRef.current?.contains(target)) return
      const hadFocus = panelsRef.current?.contains(document.activeElement) ?? false
      close(open, false)
      // After the press has moved focus wherever it was going to.
      if (hadFocus) setTimeout(() => buttons.current.get(open)?.focus({ preventScroll: true }))
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open, close])

  return (
    <div
      className="summit-nav"
      data-motion={reducedMotion ? 'reduced' : undefined}
      data-glass={FORCE_OPAQUE_GLASS ? 'opaque' : undefined}
    >
      <nav ref={navRef} className="summit-rail glass" aria-label={RESUME_UI.navLabel} inert={!live}>
        <ul ref={listRef} className="summit-rail-list">
          {RESUME.map((section) => (
            <li key={section.id}>
              <button
                ref={(el) => {
                  if (el) buttons.current.set(section.id, el)
                  else buttons.current.delete(section.id)
                }}
                type="button"
                className="summit-rail-item"
                aria-expanded={open === section.id}
                aria-controls={panelId(section.id)}
                onClick={() => (open === section.id ? close(section.id, false) : show(section.id))}
              >
                <span className="summit-rail-dot" aria-hidden="true" />
                <span className="summit-rail-label">{section.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* data-own-scroll: the page's keyboard scrolling (ScrollRig) leaves these keys alone. */}
      <div ref={panelsRef} className="summit-panels" data-own-scroll>
        {RESUME.map((section) => (
          <Panel
            key={section.id}
            section={section}
            open={open === section.id}
            onClose={() => close(section.id, true)}
            bodyRef={(el) => {
              if (el) bodies.current.set(section.id, el)
              else bodies.current.delete(section.id)
            }}
          />
        ))}
      </div>
    </div>
  )
}
