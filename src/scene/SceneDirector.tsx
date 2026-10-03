import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { MathUtils, type PerspectiveCamera, Vector3 } from 'three'
import { clamp, damp } from '../lib/math'
import { sceneStats } from '../lib/debug'
import { sceneProgress, scrollStore } from '../scroll/scrollStore'
import { sampleCameraPath } from './cameraPath'
import { CAMERA_DAMPING, CAMERA_FOV, CAMERA_FOV_MAX, CAMERA_MIN_HFOV } from './config'
import { surfaceHeightAt } from './terrain.ts'

const targetPos = new Vector3()
const targetLook = new Vector3()

/** Damp v toward `to`, snapping once within 1 mm so a resting pose is exactly f(t). */
function dampVector(v: Vector3, to: Vector3, lambda: number, dt: number): void {
  v.set(damp(v.x, to.x, lambda, dt), damp(v.y, to.y, lambda, dt), damp(v.z, to.z, lambda, dt))
  if (v.distanceToSquared(to) < 1e-6) v.copy(to)
}

const TAN_HALF_MIN_HFOV = Math.tan(MathUtils.degToRad(CAMERA_MIN_HFOV / 2))

/** Vertical FOV for an aspect: CAMERA_FOV, widened on portrait screens (see config). */
function fovForAspect(aspect: number): number {
  const needed = MathUtils.radToDeg(2 * Math.atan(TAN_HALF_MIN_HFOV / aspect))
  return clamp(needed, CAMERA_FOV, CAMERA_FOV_MAX)
}

/**
 * Reads the scroll store inside useFrame and poses the camera. The target pose is a
 * pure function of t; the final pose is lightly damped so nothing ever snaps.
 * Reduced motion swaps continuous travel for one static pose per beat.
 */
export function SceneDirector({ reducedMotion }: { reducedMotion: boolean }) {
  const pose = useRef({ pos: new Vector3(), look: new Vector3(), primed: false })

  useFrame(({ camera }) => {
    const cam = camera as PerspectiveCamera
    const fov = fovForAspect(cam.aspect)
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }

    const s = scrollStore
    sampleCameraPath(sceneProgress(reducedMotion), targetPos, targetLook)

    const p = pose.current
    if (!p.primed || reducedMotion) {
      p.pos.copy(targetPos)
      p.look.copy(targetLook)
      p.primed = true
    } else {
      dampVector(p.pos, targetPos, CAMERA_DAMPING, s.dt)
      dampVector(p.look, targetLook, CAMERA_DAMPING, s.dt)
    }

    camera.position.copy(p.pos)
    camera.lookAt(p.look)

    sceneStats.camX = p.pos.x
    sceneStats.camY = p.pos.y
    sceneStats.camZ = p.pos.z
    sceneStats.lookX = p.look.x
    sceneStats.lookY = p.look.y
    sceneStats.lookZ = p.look.z
    sceneStats.clearance = p.pos.y - surfaceHeightAt(p.pos.x, p.pos.z)
  })

  return null
}
