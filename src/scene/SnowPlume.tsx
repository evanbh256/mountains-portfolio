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
  Vector2,
  Vector3,
} from 'three'
import { smoothstep } from '../lib/math'
import { IS_LOW } from '../lib/quality'
import { sceneProgress, scrollStore } from '../scroll/scrollStore'
import { atmosphereAt } from './atmosphere'
import { PLUME, RENDER_ORDER, WIND_DIR } from './config'
import { mulberry32 } from './noise'
import { farRangePeaks } from './terrain.ts'
import { wind } from './wind'

// Spindrift: the banner of snow the wind tears off a summit ridge and carries downwind. It
// hangs on the tallest horizon peak in the view direction, which is the one thing in the
// summit shot far enough away to have weather of its own.
//
// Every particle runs the same loop in the vertex shader - lift off the ridge, stream
// downwind, spread and fade - offset by its own seed, so the CPU never touches it.

const plumeVertex = /* glsl */ `
  uniform vec3 uOrigin;
  uniform vec2 uWind;
  uniform float uTime;
  uniform float uLength;
  uniform float uRise;
  uniform float uSpread;
  uniform float uSize;
  uniform float uProjScale;
  attribute vec3 aSeed; // phase offset, across-ridge position, size
  varying float vFade;
  void main() {
    // age 0..1, each particle offset so the stream is continuous.
    float age = fract(uTime + aSeed.x);
    vec2 across = vec2(uWind.y, -uWind.x);
    vec3 p = uOrigin;
    p.xz += across * aSeed.y * uSpread;
    p.xz += uWind * age * uLength;
    // Lifts as it goes, then settles: snow thrown up and falling back out of the wind.
    p.y += uRise * (age * 1.6 - age * age * 1.1);
    p.xz += across * (aSeed.z - 0.5) * age * uSpread * 0.8;

    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(-mv.z, 0.001);
    gl_PointSize = min(uSize * (0.35 + age) * aSeed.z * uProjScale / dist, 512.0);
    // In at the ridge, out as it thins downwind.
    vFade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.45, 1.0, age));
  }
`

const plumeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    float a = 1.0 - smoothstep(0.0, 1.0, length(gl_PointCoord - 0.5) * 2.0);
    gl_FragColor = vec4(uColor, a * a * uOpacity * vFade);
    #include <colorspace_fragment>
  }
`

function createPlume() {
  const count = IS_LOW ? PLUME.LOW_COUNT : PLUME.COUNT
  const rand = mulberry32(919)
  const seeds = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    seeds[i * 3] = rand()
    seeds[i * 3 + 1] = rand() * 2 - 1
    seeds[i * 3 + 2] = 0.45 + rand() * 0.8
  }
  const geometry = new BufferGeometry()
  // position is unused - everything comes from aSeed - but three needs one to count vertices.
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 3))
  geometry.boundingSphere = null

  const peak = farRangePeaks(0)
    .filter((p) => Math.abs(p.angle) < MathUtils.degToRad(50))
    .sort((a, b) => b.height - a.height)[0]

  const uniforms = {
    uOrigin: { value: new Vector3(peak ? peak.x : 0, peak ? peak.height * 0.92 : 60, peak ? peak.z : -30) },
    uWind: { value: new Vector2(...WIND_DIR).normalize() },
    uTime: { value: 0 },
    uLength: { value: PLUME.LENGTH },
    uRise: { value: PLUME.RISE },
    uSpread: { value: PLUME.SPREAD },
    uSize: { value: PLUME.SIZE },
    uProjScale: { value: 1 },
    uColor: { value: new Color() },
    uOpacity: { value: 0 },
  }

  const points = new Points(
    geometry,
    new ShaderMaterial({
      uniforms,
      vertexShader: plumeVertex,
      fragmentShader: plumeFragment,
      transparent: true,
      depthWrite: false,
    }),
  )
  points.frustumCulled = false
  points.renderOrder = RENDER_ORDER.mist
  return { points, uniforms }
}

type PlumeParts = ReturnType<typeof createPlume>

function updatePlume(parts: PlumeParts, camera: PerspectiveCamera, bufferHeight: number, t: number, time: number) {
  const u = parts.uniforms
  const show =
    smoothstep(PLUME.T_IN[0], PLUME.T_IN[1], t) * (1 - smoothstep(PLUME.T_OUT[0], PLUME.T_OUT[1], t))
  parts.points.visible = show > 0.002
  if (!parts.points.visible) return
  const atm = atmosphereAt(t)
  u.uTime.value = (time * PLUME.SPEED) / PLUME.LENGTH
  u.uProjScale.value = bufferHeight / (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2))
  u.uColor.value.copy(atm.cloud)
  u.uOpacity.value = show * PLUME.OPACITY * (0.6 + 0.4 * wind.strength)
}

/** Snow streaming off the highest horizon peak, in the scene's own wind. */
export function SnowPlume({ reducedMotion }: { reducedMotion: boolean }) {
  const parts = useMemo(() => createPlume(), [])

  useEffect(
    () => () => {
      parts.points.geometry.dispose()
      parts.points.material.dispose()
    },
    [parts],
  )

  useFrame(({ camera, size, viewport }) =>
    updatePlume(
      parts,
      camera as PerspectiveCamera,
      size.height * viewport.dpr,
      sceneProgress(reducedMotion),
      reducedMotion ? 0 : scrollStore.time,
    ),
  )

  return <primitive object={parts.points} />
}
