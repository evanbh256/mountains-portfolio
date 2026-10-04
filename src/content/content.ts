// All user-visible copy lives here and in resume.ts. Components never hard-code text.
// The climb copy below is Evan's own wording (2026-10-03), all lowercase on purpose; do not
// recapitalize it or add numbers or details he hasn't given.
//
// © 2026 Evan Bhandari. All rights reserved. The copy in src/content/ (and his photograph,
// mountain.jpg) is not covered by the MIT License in LICENSE; see "License" in README.md.

import type { BrandIcon } from '../ui/icons'
import mountainPhoto from './mountain.jpg'

export interface BeatBoxLink {
  /** Lowercase, like the copy; read out as the link's name (the link shows only the icon). */
  label: string
  href: string
  icon: BrandIcon
}

/** The glass box on the right of a beat: the summit panel's glass, fading with the copy. */
export interface BeatBox {
  /** Without a title the box is just its links, and `label` names it for screen readers. */
  title?: string
  label?: string
  /** Optional Devanagari line beside the title, as on the summit panels. */
  ne?: string
  /** A smaller line under the title. */
  body?: string
  /** A photograph across the top of the box. */
  image?: { src: string; alt: string }
  /** A row of icon links under the body. */
  links?: BeatBoxLink[]
}

export interface BeatContent {
  id: string
  /** The section's name, an italic line above the headline. */
  pill?: string
  /** Optional italic line shown above the section name. */
  lead?: string
  /** Lowercase: the display face carries the emphasis. */
  headline: string
  line?: string
  /**
   * `dark` = navy text for bright scenes, `light` = white text for dark scenes. `split` is
   * light on phones and dark from 768px up, for a beat whose backdrop differs with the
   * frame's shape (pass 4: dark rock behind the copy on a phone, pale mist on desktop).
   */
  tone: 'light' | 'dark' | 'split'
  /**
   * Where the copy sits. `lower-left` (the default) is the copy zone the Nepal layer keeps
   * its props out of; `top-right` is for the summit title, which has the sky behind it.
   */
  place?: 'lower-left' | 'top-right'
  box?: BeatBox
}

export const SITE = {
  heroLabel: 'Introduction',
} as const

/**
 * One entry per dwell stop on the climb (BEAT_COUNT), in order. The first TEXT_BEAT_COUNT
 * sit in the lower-left copy zone; the last is only a title, top right, over the approach to
 * the summit.
 */
export const BEATS: BeatContent[] = [
  {
    id: 'hello',
    lead: 'namaste',
    pill: 'hello',
    headline: "i'm evan bhandari",
    line: 'cyber student and analyst, interested in networking and the mountains.',
    tone: 'light',
  },
  {
    id: 'what-i-do',
    pill: 'what i do',
    headline: 'i protect systems and the people who use them',
    line: "cybersecurity analyst in dsu's security operations center. i investigate alerts in microsoft defender and hunt with kql for what automated alerting missed.",
    tone: 'light',
  },
  {
    id: 'what-i-like',
    pill: 'what i like',
    headline: 'networking, cyber, coffee and trekking',
    line: 'i enjoy defense focused cybersecurity equally as i love coffee and getting lost in the mountains.',
    tone: 'light',
    box: {
      title: 'mardi base camp',
      body: 'june 2026',
      image: {
        src: mountainPhoto,
        alt: 'Evan resting against the Mardi Himal Base Camp sign, with cloud drifting across the peaks behind.',
      },
    },
  },
  {
    id: 'more-i-like',
    pill: 'more stuff i like',
    headline: 'competing, videography, music and movies',
    tone: 'split',
    box: {
      label: 'elsewhere',
      links: [
        { label: 'youtube', href: 'https://www.youtube.com/@Nave256/videos', icon: 'youtube' },
        {
          label: 'spotify',
          href: 'https://open.spotify.com/user/i55p2yu0nlxhqktcpvys6gbei?si=5a8bd9e72ff34c15',
          icon: 'spotify',
        },
        { label: 'letterboxd', href: 'https://letterboxd.com/nave256/', icon: 'letterboxd' },
      ],
    },
  },
  {
    id: 'summit',
    headline: 'the summit.',
    // Navy at every width: white measured 2.2 to 2.7:1 against the pale summit sky.
    tone: 'dark',
    place: 'top-right',
  },
]

/** The song in the music pill (ui/MusicPill.tsx). Its audio plays through YouTube's player. */
export const MUSIC = {
  title: 'mountain high',
  artist: 'bipul chettri',
  videoId: 'XBGAtvldjqM',
  href: 'https://www.youtube.com/watch?v=XBGAtvldjqM',
  /** 0 to 100, before the visitor touches the knob. */
  volume: 50,
} as const
