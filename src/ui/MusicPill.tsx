import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type PointerEvent,
  type SetStateAction,
} from 'react'
import { MUSIC } from '../content/content'
import { RAIL_GLASS, useLiquidGlass } from '../summit/liquidGlass'
import { PAUSE_PATHS, PLAY_PATHS } from './icons'
import { loadYouTube, YT_STATE, type YTPlayer } from './youtube'
import '../summit/summit.css'

/** loading: the player is starting or buffering. paused: by the visitor, or autoplay was blocked. */
type Status = 'loading' | 'playing' | 'paused' | 'error'

const clampVolume = (v: number) => Math.round(Math.min(100, Math.max(0, v)))

/** Volume change per arrow key or wheel notch, and per px of drag. */
const STEP = 5
const DRAG_RATE = 0.6

interface VolumeKnobProps {
  value: number
  onChange: Dispatch<SetStateAction<number>>
}

/**
 * A rotary volume knob: a 270° arc from bottom left to bottom right, filled to the level, and a
 * cap whose tick points at it. Drag up or right to raise it, scroll over it, or use the arrow,
 * Page and Home/End keys. It is a slider to assistive technology.
 */
function VolumeKnob({ value, onChange }: VolumeKnobProps) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; from: number } | null>(null)

  // The wheel needs a non-passive listener to keep the event for itself.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const notch = Math.sign(e.deltaY || -e.deltaX)
      if (notch) onChange((v) => clampVolume(v - notch * STEP))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onChange])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, from: value }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    onChange(clampVolume(d.from + (e.clientX - d.x - (e.clientY - d.y)) * DRAG_RATE))
  }
  const endDrag = () => {
    drag.current = null
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next: Record<string, (v: number) => number> = {
      ArrowUp: (v) => v + STEP,
      ArrowRight: (v) => v + STEP,
      ArrowDown: (v) => v - STEP,
      ArrowLeft: (v) => v - STEP,
      PageUp: (v) => v + 2 * STEP,
      PageDown: (v) => v - 2 * STEP,
      Home: () => 0,
      End: () => 100,
    }
    const step = next[e.key]
    if (!step) return
    // Before the page's keyboard scrolling (ScrollRig), which skips prevented events.
    e.preventDefault()
    onChange((v) => clampVolume(step(v)))
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
      className="music-knob"
      style={{ '--level': value / 100 } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <span className="music-knob-cap glass-inset" aria-hidden="true" />
    </div>
  )
}

/** Runs `fn` once the page is idle (or soon, where there is no requestIdleCallback). */
function whenIdle(fn: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = requestIdleCallback(fn, { timeout: 1500 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(fn, 600)
  return () => clearTimeout(id)
}

/** How long a started player may sit unstarted before the pill concludes autoplay was blocked. */
const AUTOPLAY_GRACE_MS = 2000

/** Inputs a browser counts as the visitor's first interaction (wheel and scroll do not). */
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const

/**
 * The song: a small glass pill, fixed in a corner for the whole page, with play/pause, the
 * title (a link to the video on YouTube) and a volume knob. The audio comes from YouTube's own
 * player, kept out of sight, focus and the accessibility tree.
 *
 * It starts on its own. The player loads once the page is idle and plays straight away where
 * the browser allows sound before any interaction (Chrome does for sites a visitor often plays
 * media on). Where it does not, the song starts on the visitor's first click, tap or key press
 * anywhere on the page, unless they have paused it themselves.
 */
export function MusicPill() {
  const pillRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  /** Set once the player is ready to take commands. */
  const player = useRef<YTPlayer | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  /** Bumped to build the player again after it failed to load. */
  const [attempt, setAttempt] = useState(0)
  /** The song has been heard: the first-interaction start is no longer needed. */
  const [heard, setHeard] = useState(false)
  /** The visitor paused it: from then on only the play button starts it. */
  const userPaused = useRef(false)
  const [volume, setVolume] = useState<number>(MUSIC.volume)
  const volumeNow = useRef(volume)
  useLiquidGlass(pillRef, RAIL_GLASS)

  useEffect(() => {
    volumeNow.current = volume
    player.current?.setVolume(volume)
  }, [volume])

  // Build the player once the page is idle, and try to start the song.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let created: YTPlayer | null = null
    let grace = 0
    let begun = false
    const cancelIdle = whenIdle(async () => {
      try {
        const YT = await loadYouTube()
        if (cancelled) return
        // The player replaces the element it is given, so it gets one of its own, not React's.
        const el = document.createElement('div')
        host.append(el)
        created = new YT.Player(el, {
          host: 'https://www.youtube-nocookie.com',
          videoId: MUSIC.videoId,
          width: 200,
          height: 200,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            playsinline: 1,
            loop: 1,
            playlist: MUSIC.videoId, // loop only repeats a playlist, so the song is one
            rel: 0,
            iv_load_policy: 3,
          },
          events: {
            onReady: ({ target }) => {
              if (cancelled) return
              player.current = target
              target.getIframe().tabIndex = -1
              target.setVolume(volumeNow.current)
              if (userPaused.current) {
                setStatus('paused')
                return
              }
              target.playVideo()
              // Blocked autoplay leaves the player unstarted, with no event to say so: if it has
              // not begun by now, show play, and the first interaction starts it.
              grace = window.setTimeout(() => {
                if (!begun) setStatus('paused')
              }, AUTOPLAY_GRACE_MS)
            },
            onStateChange: ({ data }) => {
              if (data === YT_STATE.playing) {
                begun = true
                setHeard(true)
                setStatus('playing')
              } else if (data === YT_STATE.buffering) {
                begun = true
                setStatus('loading')
              } else if (data === YT_STATE.paused || data === YT_STATE.ended) {
                setStatus('paused')
              }
              // unstarted and cued: nothing has happened yet; the grace timer decides.
            },
            onError: () => setStatus('error'),
          },
        })
      } catch {
        if (!cancelled) setStatus('error')
      }
    })
    return () => {
      cancelled = true
      cancelIdle()
      clearTimeout(grace)
      created?.destroy()
      player.current = null
      host.replaceChildren()
    }
  }, [attempt])

  // Until the song has been heard, the visitor's first interaction anywhere starts it: that is
  // the moment the browser starts allowing sound. A press on the song's title is left alone,
  // since it opens the song on YouTube.
  useEffect(() => {
    if (heard) return
    const start = (e: Event) => {
      if (userPaused.current || (e.target as Element | null)?.closest?.('.music-title')) return
      player.current?.playVideo()
    }
    for (const type of GESTURES) window.addEventListener(type, start, { capture: true, passive: true })
    return () => {
      for (const type of GESTURES) window.removeEventListener(type, start, { capture: true })
    }
  }, [heard])

  const toggle = () => {
    if (status === 'error') {
      setStatus('loading')
      setAttempt((n) => n + 1)
      return
    }
    const pausing = status === 'playing' || status === 'loading'
    userPaused.current = pausing
    const p = player.current
    // Not ready yet: onReady reads userPaused.
    if (!p) setStatus(pausing ? 'paused' : 'loading')
    else if (pausing) p.pauseVideo()
    else p.playVideo()
  }

  const sounding = status === 'playing' || status === 'loading'
  const label = status === 'error' ? 'play (the song did not load)' : sounding ? 'pause' : 'play'

  return (
    <>
      <div ref={pillRef} className="music-pill glass copy-enter" role="group" aria-label="music">
        <button
          type="button"
          className="music-play glass-inset"
          aria-label={label}
          title={label}
          aria-busy={status === 'loading'}
          data-status={status}
          onClick={toggle}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            {(sounding ? PAUSE_PATHS : PLAY_PATHS).map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
        </button>
        <a className="music-title" href={MUSIC.href} target="_blank" rel="noopener noreferrer">
          <span className="music-song">{MUSIC.title}</span>
          <span className="music-artist">{MUSIC.artist}</span>
        </a>
        <VolumeKnob value={volume} onChange={setVolume} />
      </div>
      {/* YouTube's player: playing, but transparent, inert and hidden from screen readers. */}
      <div ref={hostRef} className="music-player" aria-hidden="true" inert />
    </>
  )
}
