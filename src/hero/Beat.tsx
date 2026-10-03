import type { Ref } from 'react'
import type { BeatContent } from '../content/content'

interface BeatProps {
  beat: BeatContent
  index: number
  /** Only the active beat is focusable and receives pointer events. */
  active: boolean
  /** Stacked = absolutely layered in the pinned stage; otherwise an ordinary section. */
  stacked: boolean
  /** The text block; the hero writes its opacity/transform/visibility every frame. */
  ref?: Ref<HTMLDivElement>
}

export function Beat({ beat, index, active, stacked, ref }: BeatProps) {
  const titleId = `beat-${beat.id}-title`
  const Heading = index === 0 ? 'h1' : 'h2'
  const light = beat.tone === 'light'
  const split = beat.tone === 'split'

  return (
    <article
      aria-labelledby={titleId}
      inert={!active}
      className={[
        stacked ? 'pointer-events-none absolute inset-0 flex items-end' : 'relative flex min-h-[85svh] items-end',
        // The first beat is on screen at scroll 0, so it has no scroll fade-in of its own:
        // it fades in once as the page opens instead, a moment after the scene.
        index === 0 ? 'copy-enter' : '',
      ].join(' ')}
    >
      <div
        ref={ref}
        className={[
          'relative isolate w-full px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] md:w-fit md:max-w-[33rem] md:pr-10 md:pb-16 md:pl-16',
          active && stacked ? 'pointer-events-auto' : '',
          light ? 'copy-light text-white' : split ? 'copy-split' : 'copy-dark text-ink',
        ].join(' ')}
      >
        {/* The section's name, set like the lead: an italic line, no box. */}
        <p className="section-name t-lead mb-1.5">{beat.pill}</p>

        {beat.lead && <p className="t-lead mb-1.5">{beat.lead}</p>}

        <Heading id={titleId} className={index === 0 ? 't-display max-w-[14ch]' : 't-h2 max-w-[19ch]'}>
          {beat.headline}
        </Heading>

        <p className="t-body mt-4 max-w-measure">{beat.line}</p>

        {/* Plain text, not links (see BeatContent.refs), so they are not underlined either:
            an underline is a promise that something happens on click. */}
        {beat.refs && (
          <ul className="t-label mt-3.5 flex flex-wrap gap-x-5 gap-y-1">
            {beat.refs.map((ref) => (
              <li key={ref} className="inline-flex items-center gap-2">
                <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--nepal-crimson-deep)]" aria-hidden="true" />
                {ref}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
