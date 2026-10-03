import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { WebGLRenderer } from 'three'
import { samplePerformance } from '../lib/perfGuard'
import { IS_LOW } from '../lib/quality'
import { debugHandles, sceneStats } from '../lib/debug'
import { scrollStore } from '../scroll/scrollStore'
import { FRAME_PRIORITY, onFrame } from '../scroll/ticker'
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, CAMERA_PATH, DPR_DESKTOP, DPR_MOBILE } from './config'
import { BeatCrossfade } from './BeatCrossfade'
import { Clouds } from './Clouds'
import { installAerialFog } from './fog'
import { Grass } from './Grass'
import { LightShafts } from './LightShafts'
import { Mist } from './Mist'
import { Rocks } from './Rocks'
import { NepalLayer } from './nepal/NepalLayer'
import { SceneDirector } from './SceneDirector'
import { Sky } from './Sky'
import { SnowPlume } from './SnowPlume'
import { updateWind } from './wind'
import { Terrain } from './Terrain.tsx'

// Height-aware fog, patched into three's shader chunks before any material compiles.
installAerialFog()

/**
 * Renders the R3F scene from the shared ticker instead of R3F's own loop.
 *
 * The Canvas runs with frameloop="never", so R3F never schedules frames by itself.
 * Each tick, after the scroll state has updated, this calls advance(), which runs
 * the useFrame callbacks and renders once. The hero is the whole page, so the canvas is
 * never covered and the call is never skipped.
 */
function FrameBridge() {
  const advance = useThree((s) => s.advance)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    debugHandles.scene = scene
    debugHandles.gl = gl
    debugHandles.camera = camera
    return () => {
      debugHandles.scene = null
      debugHandles.gl = null
      debugHandles.camera = null
    }
  }, [scene, gl, camera])

  useEffect(
    () =>
      onFrame((time) => {
        advance(time)
        sceneStats.rendering = true
        sceneStats.triangles = gl.info.render.triangles
        sceneStats.calls = gl.info.render.calls
        sceneStats.dpr = gl.getPixelRatio()
      }, FRAME_PRIORITY.scene),
    [advance, gl],
  )

  useEffect(
    () => () => {
      sceneStats.rendering = false
    },
    [],
  )

  return null
}

/** Advances the scene's one wind, ahead of everything that leans in it. */
function WindDriver({ reducedMotion }: { reducedMotion: boolean }) {
  useFrame(() => {
    updateWind(scrollStore.dt, scrollStore.velocity, reducedMotion)
    samplePerformance(scrollStore.dt)
  })
  return null
}

interface SceneRootProps {
  reducedMotion: boolean
  /** Called if the WebGL renderer cannot be created. */
  onFail: () => void
}

export function SceneRoot({ reducedMotion, onFail }: SceneRootProps) {
  return (
    <Canvas
      frameloop="never"
      flat // no tone mapping: atmosphere colors render exactly as authored
      dpr={IS_LOW ? DPR_MOBILE : DPR_DESKTOP}
      resize={{ scroll: false }} // the canvas is fixed, only size changes matter
      camera={{ fov: CAMERA_FOV, near: CAMERA_NEAR, far: CAMERA_FAR, position: CAMERA_PATH[0]!.pos }}
      gl={async (defaults) => {
        try {
          return new WebGLRenderer({ ...defaults, antialias: true, powerPreference: 'high-performance' })
        } catch {
          // Hand over to the fallback and leave R3F waiting; it unmounts with the Canvas.
          onFail()
          return new Promise<WebGLRenderer>(() => {})
        }
      }}
    >
      <FrameBridge />
      {/* SceneDirector poses the camera first; Sky, Clouds and Mist then recenter on it. */}
      <SceneDirector reducedMotion={reducedMotion} />
      <WindDriver reducedMotion={reducedMotion} />
      <Sky reducedMotion={reducedMotion} />
      <Terrain reducedMotion={reducedMotion} />
      <Grass />
      <Rocks />
      <Clouds reducedMotion={reducedMotion} />
      <Mist reducedMotion={reducedMotion} />
      <SnowPlume reducedMotion={reducedMotion} />
      <LightShafts reducedMotion={reducedMotion} />
      <NepalLayer reducedMotion={reducedMotion} />
      {reducedMotion && <BeatCrossfade />}
    </Canvas>
  )
}
