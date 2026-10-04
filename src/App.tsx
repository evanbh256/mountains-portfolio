import { lazy, Profiler, Suspense, useState } from 'react'
import { Hero } from './hero/Hero'
import { debugCounters } from './lib/debug'
import { useReducedMotion, webglAvailable } from './lib/env'
import { SceneBoundary } from './scene/SceneBoundary'
import { ScrollRig } from './scroll/ScrollRig'
import { SummitNav } from './summit/SummitNav'
import { DebugHud } from './ui/DebugHud'
import { MusicPill } from './ui/MusicPill'
import { NepalAccents } from './ui/NepalAccents'

// three.js and R3F live in their own chunk, so the text and scroll rig are live first.
const SceneRoot = lazy(() => import('./scene/SceneRoot').then((m) => ({ default: m.SceneRoot })))

const countCommit = () => {
  debugCounters.reactCommits++
}

/**
 * The page is the hero and nothing else: the climb, ending with the camera parked at the
 * summit. There is no top bar and no section below it. The resume lives at the summit, in a
 * rail down the left edge whose sections open as glass panels over the scene.
 */
export default function App() {
  const reducedMotion = useReducedMotion()
  const [webgl, setWebgl] = useState(webglAvailable)
  const fail = () => setWebgl(false)

  return (
    <Profiler id="app" onRender={countCommit}>
      <NepalAccents />

      {/* Layer 0: the fixed WebGL canvas. Without WebGL the CSS gradient behind it is the poster. */}
      <div id="gl" aria-hidden="true">
        {webgl && (
          <SceneBoundary onError={fail}>
            <Suspense fallback={null}>
              <SceneRoot reducedMotion={reducedMotion} onFail={fail} />
            </Suspense>
          </SceneBoundary>
        )}
      </div>

      {/* Layer 1: the only scrolling element. */}
      <ScrollRig reducedMotion={reducedMotion}>
        <Hero pinned={webgl} reducedMotion={reducedMotion} />
      </ScrollRig>

      {/* Layer 2: fixed above the scroller, so a panel opening never scrolls anything. */}
      <SummitNav pinned={webgl} reducedMotion={reducedMotion} />
      <MusicPill />

      <DebugHud />
    </Profiler>
  )
}
