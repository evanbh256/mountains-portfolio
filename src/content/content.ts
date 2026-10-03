// All user-visible copy lives here and in resume.ts. Components never hard-code text.
// Everything below comes from Evan's resume; do not add numbers or details it doesn't have.
//
// © 2026 Evan Bhandari. All rights reserved. The copy in src/content/ is not covered by the
// MIT License in LICENSE; see "License" in README.md.

export interface BeatContent {
  id: string
  pill: string
  /** Optional italic lead-in shown above the headline. */
  lead?: string
  /** Sentence case: the display face carries the emphasis, so nothing is typed in capitals. */
  headline: string
  line: string
  /**
   * `dark` = navy text for bright scenes, `light` = white text for dark scenes. `split` is
   * light on phones and dark from 768px up, for a beat whose backdrop differs with the
   * frame's shape (Competitions: dark rock behind the copy on a phone, pale mist on desktop).
   */
  tone: 'light' | 'dark' | 'split'
  /**
   * Named references under the line. Plain text, not links: the sections they name open
   * from the summit rail (summit/SummitNav.tsx), which only exists once the climb is over.
   */
  refs?: string[]
}

export const SITE = {
  heroLabel: 'Introduction',
} as const

/**
 * The four text beats on the climb. The camera makes five dwell stops (BEAT_COUNT); the
 * fifth carries no text on purpose - it is the approach to the summit, a pure view.
 */
export const BEATS: BeatContent[] = [
  {
    id: 'hello',
    pill: 'Hello',
    lead: 'Namaste,',
    headline: "I'm Evan Bhandari",
    line: "Cyber Operations student at Dakota State University. I look for what's hidden in the fog.",
    tone: 'light',
  },
  {
    id: 'what-i-do',
    pill: 'What I do',
    headline: 'I study how systems break, so they can hold',
    line: "Analyst in DSU's Cybersecurity Operations Center, triaging alerts in Microsoft Defender and hunting threats with KQL.",
    tone: 'light',
    refs: ['Experience'],
  },
  {
    id: 'selected-work',
    pill: 'Selected work',
    headline: "Two things I've built",
    line: 'A dungeon crawler you play with Linux commands, and an AI planner for students.',
    tone: 'light',
    refs: ['Terminal Quest', 'HandAll'],
  },
  {
    id: 'competitions',
    pill: 'Competitions',
    headline: 'I train against live red teams',
    line: '5th at NCAE Cyber Games regionals. 4th overall at HiveCTF, and 1st in the DSU bracket.',
    tone: 'split',
    refs: ['All results'],
  },
]
