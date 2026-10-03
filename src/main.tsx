import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'lenis/dist/lenis.css'
import './index.css'
import App from './App.tsx'
import { debugCounters, debugHandles, sceneStats } from './lib/debug'
import { ATMOSPHERE, PALETTE } from './scene/config'
import { scrollToBeat, scrollToY } from './scroll/navigation'
import { heroLayout, rig, scrollStore } from './scroll/scrollStore'

// Push config colors into CSS: the gradient behind the canvas (shown before the first frame,
// and as the no-WebGL poster) takes the first beat's sky, and the UI theme takes PALETTE.
// index.css carries the same values as a fallback for the moment before this script runs.
const firstSky = ATMOSPHERE[0]!
const rootStyle = document.documentElement.style
rootStyle.setProperty('--sky-top', firstSky.skyTop)
rootStyle.setProperty('--sky-horizon', firstSky.fog)
rootStyle.setProperty('--color-ink', PALETTE.ink)

if (import.meta.env.DEV) {
  // Console/automation handle for verifying the scroll rig.
  Object.assign(window, {
    __hero: { scrollStore, heroLayout, rig, sceneStats, debugCounters, debugHandles, scrollToBeat, scrollToY },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
