// One quality tier for the whole scene, decided once at load.
//
// Phones and coarse pointers get the low tier; `?q=low` or `?q=high` overrides it, which is
// how you check the fallback on a desktop. Anything that costs frames - grass count, blade
// segments, terrain resolution, light shafts - reads this rather than testing for mobile
// itself, so there is one place to turn things down.

import { IS_MOBILE } from './env'

export type Quality = 'high' | 'low'

function pick(): Quality {
  const forced = new URLSearchParams(window.location.search).get('q')
  if (forced === 'low' || forced === 'high') return forced
  return IS_MOBILE ? 'low' : 'high'
}

export const QUALITY: Quality = pick()
export const IS_LOW = QUALITY === 'low'
