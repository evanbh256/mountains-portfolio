// Icon path data, 24x24 viewBox. Sourced, not drawn (see README "Credits").

/**
 * A brand mark, white at rest. Lit (hover, keyboard focus), each part takes its brand colour,
 * and `under` fills what the single-colour mark leaves as holes: YouTube's white play arrow,
 * Spotify's black waves, the darker overlaps between Letterboxd's dots.
 */
export interface BrandMark {
  parts: { d: string; lit: string }[]
  under?: { d: string; lit: string }[]
  /** The glow round the lit mark. */
  glow: string
}

/**
 * Shapes from Simple Icons 16.33.0 (CC0 1.0; the marks themselves are their owners'
 * trademarks). Letterboxd's single path is split into its three dots, and the overlaps added
 * under them, to colour it like the official decal (letterboxd.com/about/brand); colours are
 * each brand's own.
 */
export const BRANDS = {
  youtube: {
    parts: [
      {
        d: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
        lit: '#FF0000',
      },
    ],
    under: [{ d: 'M9.545 15.568V8.432L15.818 12l-6.273 3.568z', lit: '#FFFFFF' }],
    glow: '#FF0000',
  },
  spotify: {
    parts: [
      {
        d: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
        lit: '#1ED760',
      },
    ],
    under: [{ d: 'M12 .5a11.5 11.5 0 1 0 0 23 11.5 11.5 0 1 0 0-23z', lit: '#000000' }],
    glow: '#1ED760',
  },
  letterboxd: {
    parts: [
      {
        d: 'M8.224 14.352a4.447 4.447 0 0 1-3.775 2.092C1.992 16.444 0 14.454 0 12s1.992-4.444 4.45-4.444c1.592 0 2.988.836 3.774 2.092-.427.682-.673 1.488-.673 2.352s.246 1.67.673 2.352z',
        lit: '#FF8000',
      },
      {
        d: 'M15.101 12c0-.864.247-1.67.674-2.352-.786-1.256-2.183-2.092-3.775-2.092s-2.989.836-3.775 2.092c.427.682.674 1.488.674 2.352s-.247 1.67-.674 2.352c.786 1.256 2.183 2.092 3.775 2.092s2.989-.836 3.775-2.092A4.42 4.42 0 0 1 15.1 12z',
        lit: '#00E054',
      },
      {
        d: 'M19.551 7.556a4.447 4.447 0 0 0-3.775 2.092c.427.682.673 1.488.673 2.352s-.246 1.67-.673 2.352a4.447 4.447 0 0 0 3.775 2.092C22.008 16.444 24 14.454 24 12s-1.992-4.444-4.45-4.444z',
        lit: '#40BCF4',
      },
    ],
    under: [
      { d: 'M8.224 9.648A4.447 4.447 0 0 1 8.224 14.352 4.447 4.447 0 0 1 8.224 9.648z', lit: '#556677' },
      { d: 'M15.776 9.648A4.447 4.447 0 0 1 15.776 14.352 4.447 4.447 0 0 1 15.776 9.648z', lit: '#556677' },
    ],
    glow: '#00E054',
  },
} satisfies Record<string, BrandMark>

export type BrandIcon = keyof typeof BRANDS

/** Tabler Icons 3.48 (MIT), "player-play" and "player-pause", filled. */
export const PLAY_PATHS = ['M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z']
export const PAUSE_PATHS = [
  'M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z',
  'M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z',
]
