// Scrolling #scroll-root to a position, for the debug HUD and for anything that needs to
// move the page without touching Lenis directly.
//
// There is no in-page anchor navigation any more: the top bar and the section below the
// hero are gone, and the words under the climb headlines are plain text rather than links,
// so nothing on the page links to a "#id". window.scrollTo does nothing here - #scroll-root
// is the scroller - so always go through these.

import { beatCenter } from './progress'
import { heroLayout, rig } from './scrollStore'

export function scrollToY(y: number): void {
  rig.lenis?.scrollTo(y, { immediate: rig.reducedMotion })
}

/** Scroll so the hero sits at progress p (0..1) of the climb. */
export function scrollToProgress(p: number): void {
  scrollToY(heroLayout.heroTop + p * heroLayout.track)
}

/** Scroll to the exact center of climb stop i, where t = p = (i + 0.5) / N. */
export function scrollToBeat(i: number): void {
  scrollToProgress(beatCenter(i))
}
