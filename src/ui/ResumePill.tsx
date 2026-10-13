import { useRef } from 'react'
import { RESUME_LINK } from '../content/content'
import { RAIL_GLASS, useLiquidGlass } from '../summit/liquidGlass'
import '../summit/summit.css'

/** Lucide "file-text" (ISC), 24x24, stroked. */
const FILE_PATHS = [
  'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
  'M14 2v4a2 2 0 0 0 2 2h4',
  'M10 9H8',
  'M16 13H8',
  'M16 17H8',
]

/** Bottom right: the rail's glass in a pill, linking to the resume PDF on Drive. */
export function ResumePill() {
  const pillRef = useRef<HTMLAnchorElement>(null)
  useLiquidGlass(pillRef, RAIL_GLASS)

  return (
    <a
      ref={pillRef}
      className="resume-pill glass copy-enter"
      href={RESUME_LINK.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="resume-icon glass-inset" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="26"
          height="26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {FILE_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </span>
      <span className="resume-label">{RESUME_LINK.label}</span>
    </a>
  )
}
