import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  MathUtils,
  type PerspectiveCamera,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'
import { IS_LOW } from '../lib/quality'
import { sceneProgress, scrollStore } from '../scroll/scrollStore'
import { atmosphereAt } from './atmosphere'
import {
  MIST_ALPHA,
  MIST_BOX,
  MIST_COUNT_DESKTOP,
  MIST_COUNT_MOBILE,
  MIST_DRIFT,
  MIST_SIZE,
  RENDER_ORDER,
} from './config'
import { mulberry32 } from './noise'

// Each particle lives at (seed position + drift) wrapped into a cube centered on the camera,
// so the cloud of mist travels with the camera at no CPU cost. Particles fade near the cube
// faces (no popping as they wrap) and right in front of the lens.
const mistVertex = /* glsl */ `
  uniform vec3 uOrigin;
  uniform vec3 uDrift;
  uniform float uBox;
  uniform float uSize;
  uniform float uProjScale;
  varying float vFade;
  void main() {
    vec3 p = mod(position + uDrift - uOrigin, uBox) - 0.5 * uBox + uOrigin;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(-mv.z, 0.001);
    gl_PointSize = min(uSize * uProjScale / dist, 512.0);
    vec3 local = abs(p - uOrigin) / (0.5 * uBox);
    float edge = max(local.x, max(local.y, local.z));
    vFade = (1.0 - smoothstep(0.65, 1.0, edge)) * smoothstep(1.5, 6.0, dist);
  }
`

const mistFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    float a = 1.0 - smoothstep(0.0, 1.0, length(gl_PointCoord - 0.5) * 2.0);
    gl_FragColor = vec4(uColor, a * uOpacity * vFade);
    #include <colorspace_fragment>
  }
`

function createMist() {
  const count = IS_LOW ? MIST_COUNT_MOBILE : MIST_COUNT_DESKTOP
  const rand = mulberry32(23)
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < positions.length; i++) positions[i] = rand() * MIST_BOX
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))

  const uniforms = {
    uOrigin: { value: new Vector3() },
    uDrift: { value: new Vector3() },
    uBox: { value: MIST_BOX },
    uSize: { value: MIST_SIZE },
    uProjScale: { value: 1 },
    uColor: { value: new Color() },
    uOpacity: { value: 0 },
  }
  const points = new Points(
    geometry,
    new ShaderMaterial({
      uniforms,
      vertexShader: mistVertex,
      fragmentShader: mistFragment,
      transparent: true,
      depthWrite: false,
    }),
  )
  points.frustumCulled = false // drawn around the camera, not where the buffer says
  points.renderOrder = RENDER_ORDER.mist
  return { points, uniforms }
}

type MistParts = ReturnType<typeof createMist>

function updateMist(parts: MistParts, camera: PerspectiveCamera, bufferHeight: number, t: number, time: number) {
  const atm = atmosphereAt(t)
  const u = parts.uniforms
  parts.points.visible = atm.mist > 0.001
  u.uOrigin.value.copy(camera.position)
  u.uDrift.value.set(MIST_DRIFT[0] * time, MIST_DRIFT[1] * time, MIST_DRIFT[2] * time)
  u.uProjScale.value = bufferHeight / (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2))
  u.uColor.value.copy(atm.cloud)
  u.uOpacity.value = atm.mist * MIST_ALPHA
}

/** Soft drifting mist near the camera (time-based drift, frozen under reduced motion). */
export function Mist({ reducedMotion }: { reducedMotion: boolean }) {
  const parts = useMemo(() => createMist(), [])

  useEffect(
    () => () => {
      parts.points.geometry.dispose()
      parts.points.material.dispose()
    },
    [parts],
  )

  useFrame(({ camera, size, viewport }) =>
    updateMist(
      parts,
      camera as PerspectiveCamera,
      size.height * viewport.dpr,
      sceneProgress(reducedMotion),
      reducedMotion ? 0 : scrollStore.time,
    ),
  )

  return <primitive object={parts.points} />
}
