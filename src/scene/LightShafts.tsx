import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  Color,
  MathUtils,
  Mesh,
  type PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'
import { clamp, smoothstep } from '../lib/math'
import { perf } from '../lib/perfGuard'
import { sceneProgress } from '../scroll/scrollStore'
import { atmosphereAt } from './atmosphere'
import { RENDER_ORDER, SHAFTS } from './config'

// Crepuscular rays: where a low sun catches mist, the air itself lights up in bands. Drawn
// as one screen-filling additive pass radiating from wherever the sun is on screen - the
// painterly version, with none of the cost of marching a depth buffer.
//
// The quad sits at the far plane and is depth tested, so the rays are occluded by the
// terrain rather than drawn across it. Nothing that should let light through writes depth:
// the sky dome and the cloud deck both leave it alone.
//
// It shows only in the moments that earn it (SHAFTS.WINDOWS): breaking out of the cloud
// layer, and again under the low sun at the summit. Everywhere else the strength is zero
// and the pass is skipped altogether.

const f = (v: number) => v.toFixed(3)

const shaftVertex = /* glsl */ `
  varying vec2 vScreen;
  void main() {
    vScreen = position.xy;
    // Sits just inside the far plane, so the depth test hides the rays behind anything
    // solid: they show in open sky and stop at a ridge line instead of being painted over
    // it. The sky dome and the cloud deck do not write depth, so rays still cross those.
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`

const shaftFragment = /* glsl */ `
  #include <common>
  #include <dithering_pars_fragment>
  uniform vec2 uSun;
  uniform float uAspect;
  uniform float uStrength;
  uniform vec3 uColor;
  varying vec2 vScreen;

  float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  /**
   * Value noise around the sun, periodic over a full turn.
   *
   * atan() jumps from +PI to -PI along the ray pointing away from the sun in -x, so noise
   * indexed by the raw angle lands on two unrelated cells either side of it and draws a
   * hard horizontal edge across the whole frame at the sun's height. Indexing by cell
   * number and wrapping with mod() makes the first cell and the last the same one, so the
   * seam closes. cells must be a whole number of cells per turn.
   */
  float beamNoise(float angle, float cells) {
    float a = (angle / 6.283185307) * cells;
    float i = floor(a);
    float h0 = hash1(mod(i, cells));
    float h1 = hash1(mod(i + 1.0, cells));
    return mix(h0, h1, smoothstep(0.0, 1.0, fract(a)));
  }

  void main() {
    vec2 d = vec2((vScreen.x - uSun.x) * uAspect, vScreen.y - uSun.y);
    float r = length(d);
    float angle = atan(d.y, d.x);

    float beams = 0.55 * beamNoise(angle, 14.0) + 0.45 * beamNoise(angle + 1.7, 43.0);
    beams = smoothstep(0.42, 1.02, beams);

    // Fade with distance from the sun, and hold back right at it so the glow keeps its shape.
    float falloff = exp(-r * ${f(SHAFTS.FALLOFF)}) * smoothstep(0.0, ${f(SHAFTS.CORE)}, r);
    gl_FragColor = vec4(uColor * beams * falloff * uStrength, 1.0);
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`

/** Strength at t: a soft rise and fall inside each window, zero outside them all. */
function shaftStrength(t: number): number {
  let out = 0
  for (const w of SHAFTS.WINDOWS) {
    const half = (w.range[1] - w.range[0]) / 2
    const mid = w.range[0] + half
    out = Math.max(out, w.strength * smoothstep(1, 0.15, Math.abs(t - mid) / half))
  }
  return out
}

const forward = new Vector3()
const right = new Vector3()
const up = new Vector3()

function createShafts() {
  const uniforms = {
    uSun: { value: new Vector2() },
    uAspect: { value: 1 },
    uStrength: { value: 0 },
    uColor: { value: new Color() },
  }
  const mesh = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      uniforms,
      vertexShader: shaftVertex,
      fragmentShader: shaftFragment,
      transparent: true,
      blending: AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      fog: false,
    }),
  )
  mesh.frustumCulled = false
  mesh.renderOrder = RENDER_ORDER.shafts
  return { mesh, uniforms }
}

type ShaftParts = ReturnType<typeof createShafts>

function updateShafts(parts: ShaftParts, camera: PerspectiveCamera, t: number): void {
  const strength = perf.level >= 2 ? 0 : shaftStrength(t)
  if (strength <= 0.001) {
    parts.mesh.visible = false
    return
  }
  const atm = atmosphereAt(t)

  // The sun in screen space, from the camera's own basis: lookAt has set the quaternion for
  // this frame, while matrixWorld has not been rebuilt yet.
  forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
  right.set(1, 0, 0).applyQuaternion(camera.quaternion)
  up.set(0, 1, 0).applyQuaternion(camera.quaternion)
  const depth = atm.sunDir.dot(forward)
  if (depth <= 0.05) {
    parts.mesh.visible = false // sun behind the camera
    return
  }
  const tanHalf = Math.tan(MathUtils.degToRad(camera.fov) / 2)
  const x = atm.sunDir.dot(right) / depth / (tanHalf * camera.aspect)
  const y = atm.sunDir.dot(up) / depth / tanHalf

  parts.mesh.visible = true
  parts.uniforms.uSun.value.set(x, y)
  parts.uniforms.uAspect.value = camera.aspect
  // Rays reach less far when the sun is near the edge of the frame, where they would cut off.
  parts.uniforms.uStrength.value = strength * clamp(1.6 - 0.45 * Math.hypot(x, y), 0, 1) * atm.glow
  parts.uniforms.uColor.value.copy(atm.sunColor)
}

/** Light rays through the mist, in the two moments of the climb that earn them. */
export function LightShafts({ reducedMotion }: { reducedMotion: boolean }) {
  const parts = useMemo(() => createShafts(), [])

  useEffect(
    () => () => {
      parts.mesh.geometry.dispose()
      parts.mesh.material.dispose()
    },
    [parts],
  )

  useFrame(({ camera }) => updateShafts(parts, camera as PerspectiveCamera, sceneProgress(reducedMotion)))

  return <primitive object={parts.mesh} />
}
