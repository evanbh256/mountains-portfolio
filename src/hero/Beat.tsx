import { useRef, type CSSProperties, type Ref } from 'react'
import type { BeatBox as BeatBoxContent, BeatContent } from '../content/content'
import { PANEL_GLASS, useLiquidGlass } from '../summit/liquidGlass'
import { BRANDS } from '../ui/icons'
import '../summit/summit.css'

interface BeatProps {
  beat: BeatContent
  index: number
  /** Only the active beat is focusable and receives pointer events. */
  active: boolean
  /** Stacked = absolutely layered in the pinned stage; otherwise an ordinary section. */
  stacked: boolean
  /** The text block; the hero writes its opacity/transform/visibility every frame. */
  ref?: Ref<HTMLDivElement>
  /** The glass box, faded by the hero alongside the text block. */
  boxRef?: (el: HTMLElement | null) => void
}

interface BeatBoxProps {
  id: string
  box: BeatBoxContent
  ref?: (el: HTMLElement | null) => void
}

/**
 * The summit panel's glass (summit.css, liquidGlass.ts) on the right of a beat, without the
 * close button: it comes and goes with the copy. The fade is written on the glass element
 * itself, never a wrapper, because an ancestor below full opacity would become the
 * backdrop root and the rim's bend would see nothing behind it.
 */
function BeatBox({ id, box, ref }: BeatBoxProps) {
  const glassRef = useRef<HTMLElement | null>(null)
  useLiquidGlass(glassRef, PANEL_GLASS)
  const titleId = `${id}-box-title`

  // Brand marks, white at rest; hovered or focused they grow and light up in their own
  // colours (summit.css, icons.ts).
  const links = box.links && (
    <ul className="beat-box-links">
      {box.links.map((link) => {
        const mark = BRANDS[link.icon]
        return (
          <li key={link.href}>
            <a
              className="beat-box-link glass-inset"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
              title={link.label}
              style={{ '--glow': mark.glow } as CSSProperties}
            >
              <svg className="brand-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                {mark.under?.map((p) => (
                  <path key={p.d} className="brand-under" d={p.d} style={{ '--lit': p.lit } as CSSProperties} />
                ))}
                {mark.parts.map((p) => (
                  <path key={p.d} className="brand-part" d={p.d} style={{ '--lit': p.lit } as CSSProperties} />
                ))}
              </svg>
            </a>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="beat-box-slot">
      <aside
        ref={(el) => {
          glassRef.current = el
          ref?.(el)
        }}
        aria-labelledby={box.title ? titleId : undefined}
        aria-label={box.title ? undefined : box.label}
        className={box.title ? 'beat-box glass' : 'beat-box beat-box--links glass'}
      >
        {/* Lazy: the box is hidden until its beat, and the scene loads first. Its frame
            (summit.css) is a fixed aspect ratio, so nothing moves when it arrives. */}
        {box.image && (
          <img className="beat-box-media" src={box.image.src} alt={box.image.alt} loading="lazy" decoding="async" />
        )}
        {box.title ? (
          <>
            <header className="glass-head">
              <h3 id={titleId} className="glass-title">
                {box.title}
              </h3>
              {box.ne && (
                <p lang="ne" className="glass-ne">
                  {box.ne}
                </p>
              )}
            </header>
            {(box.body || links) && (
              <div className="glass-body">
                {box.body && <p className="glass-copy">{box.body}</p>}
                {links}
              </div>
            )}
          </>
        ) : (
          links
        )}
      </aside>
    </div>
  )
}

export function Beat({ beat, index, active, stacked, ref, boxRef }: BeatProps) {
  const titleId = `beat-${beat.id}-title`
  const Heading = index === 0 ? 'h1' : 'h2'
  const light = beat.tone === 'light'
  const split = beat.tone === 'split'
  const topRight = beat.place === 'top-right'

  return (
    <article
      aria-labelledby={titleId}
      inert={!active}
      className={[
        stacked ? 'pointer-events-none absolute inset-0 flex' : 'relative flex min-h-[85svh]',
        topRight ? 'items-start justify-end' : 'items-end',
        // The first beat is on screen at scroll 0, so it has no scroll fade-in of its own:
        // it fades in once as the page opens instead, a moment after the scene.
        index === 0 ? 'copy-enter' : '',
      ].join(' ')}
    >
      <div
        ref={ref}
        className={[
          'beat-copy relative isolate w-full px-5 md:w-fit',
          topRight
            ? // --music-clear: below 900px the music pill (summit.css) is up here too.
              'pt-[calc(max(2.5rem,env(safe-area-inset-top))_+_var(--music-clear))] text-right md:pt-[calc(4rem_+_var(--music-clear))] md:pr-16 md:pl-10'
            : 'pb-[max(2.5rem,env(safe-area-inset-bottom))] md:max-w-[33rem] md:pr-10 md:pb-16 md:pl-16',
          active && stacked ? 'pointer-events-auto' : '',
          light ? 'copy-light text-white' : split ? 'copy-split' : 'copy-dark text-ink',
        ].join(' ')}
      >
        {beat.lead && <p className="t-lead mb-1.5">{beat.lead}</p>}

        {/* The section's name, set like the lead: an italic line, no box. */}
        {beat.pill && <p className="section-name t-lead mb-1.5">{beat.pill}</p>}

        <Heading
          id={titleId}
          className={[
            index === 0 ? 't-display max-w-[14ch]' : 't-h2 max-w-[19ch]',
            topRight ? 'ml-auto' : '',
          ].join(' ')}
        >
          {beat.headline}
        </Heading>

        {beat.line && <p className="t-body mt-4 max-w-measure">{beat.line}</p>}
      </div>

      {beat.box && <BeatBox id={`beat-${beat.id}`} box={beat.box} ref={boxRef} />}
    </article>
  )
}
