import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  type Camera,
  BackSide,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  MathUtils,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { sceneStats } from '../lib/debug'
import { sceneProgress } from '../scroll/scrollStore'
import { atmosphereAt, sunAzimuthOf, sunDirection, type AtmosphereState } from './atmosphere'
import {
  HAZE_AWAY,
  HAZE_SUN,
  HAZE_SUN_POWER,
  LIGHT_UNIT,
  RENDER_ORDER,
  SKY_FILL_ELEVATION,
  SKY_FILL_SHARE,
  SKY_FALLOFF,
  SKY_RADIUS,
  SUN_GLOW_DISTANCE,
  SUN_GLOW_SIZE_DEG,
  SUN_HALO_POWER,
} from './config'

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = world.xyz - cameraPosition; // exact view direction, wherever the dome is
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

// Horizon = fog color exactly at and below elevation 0, so fully fogged ridges melt into it.
// The sun halo only starts above the horizon for the same reason.
const skyFragment = /* glsl */ `
  #include <common>
  #include <dithering_pars_fragment>
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uHalo;
  uniform float uFalloff;
  uniform float uHaloPower;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float e = max(d.y, 0.0);
    float k = (1.0 - exp(-uFalloff * e)) / (1.0 - exp(-uFalloff));
    vec3 color = mix(uHorizon, uTop, k);
    float s = max(dot(d, uSunDir), 0.0);
    color += uSunColor * uHalo * pow(s, uHaloPower) * smoothstep(0.0, 0.06, d.y);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
    // Last, in output space: the sky is one long smooth ramp and bands without this.
    #include <dithering_fragment>
  }
`

/** Soft radial glow with a bright core, drawn once into a small canvas. */
function createGlowTexture(): CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.07, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.16, 'rgba(255,255,255,0.45)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.12)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

const forward = new Vector3()
const haze = new Color()

/**
 * The fog color for this view: haze looking into the sun is brighter and warmer, and away
 * from it a touch cooler and deeper, both in proportion to how much of the sun the scene
 * can see (`glow`). Whole-frame rather than per-fragment, so it costs nothing and every
 * fogged material (including the Nepal layer's) agrees on it.
 */
function hazeFogColor(atm: Readonly<AtmosphereState>): Color {
  const toward = forward.dot(atm.sunDir)
  haze.copy(atm.fog)
  return toward > 0
    ? haze.lerp(atm.sunColor, atm.glow * HAZE_SUN * Math.pow(toward, HAZE_SUN_POWER))
    : haze.lerp(atm.skyTop, atm.glow * HAZE_AWAY * -toward)
}

const GLOW_SCALE = 2 * SUN_GLOW_DISTANCE * Math.tan(MathUtils.degToRad(SUN_GLOW_SIZE_DEG / 2))

/** Everything the sky owns, built once. */
function createSkyParts() {
  const uniforms = {
    uTop: { value: new Color() },
    uHorizon: { value: new Color() },
    uSunColor: { value: new Color() },
    uSunDir: { value: new Vector3(0, 0, -1) },
    uHalo: { value: 0 },
    uFalloff: { value: SKY_FALLOFF },
    uHaloPower: { value: SUN_HALO_POWER },
  }
  const dome = new Mesh(
    new SphereGeometry(SKY_RADIUS, 32, 16),
    new ShaderMaterial({
      uniforms,
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: BackSide,
      depthWrite: false,
      fog: false,
      dithering: true,
    }),
  )
  dome.renderOrder = -1 // first; everything else draws over it
  dome.frustumCulled = false

  const glowTexture = createGlowTexture()
  const glow = new Sprite(
    new SpriteMaterial({
      map: glowTexture,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  )
  glow.scale.setScalar(GLOW_SCALE)
  glow.frustumCulled = false
  glow.renderOrder = RENDER_ORDER.glow // behind the cloud deck

  return {
    uniforms,
    dome,
    glow,
    glowTexture,
    fog: new FogExp2(0xffffff, 0),
    hemi: new HemisphereLight(),
    sun: new DirectionalLight(),
    skyFill: new DirectionalLight(),
  }
}

type SkyParts = ReturnType<typeof createSkyParts>

function disposeSkyParts(parts: SkyParts): void {
  parts.dome.geometry.dispose()
  ;(parts.dome.material as ShaderMaterial).dispose()
  parts.glow.material.dispose()
  parts.glowTexture.dispose()
}

/** Apply the schedule at t: fog, sky uniforms, lights, glow; recenter dome and glow on the camera. */
const fillDir = new Vector3()

function updateSky(parts: SkyParts, camera: Camera, t: number): void {
  const { uniforms, dome, glow, fog, hemi, sun, skyFill } = parts
  const atm = atmosphereAt(t)
  const cameraPosition = camera.position
  // From the quaternion, not matrixWorld: lookAt has already set it for this frame.
  forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
  const fogColor = hazeFogColor(atm)

  fog.color.copy(fogColor)
  fog.density = atm.density

  uniforms.uHorizon.value.copy(fogColor) // horizon == fog, every frame
  uniforms.uTop.value.copy(atm.skyTop)
  uniforms.uSunColor.value.copy(atm.sunColor)
  uniforms.uSunDir.value.copy(atm.sunDir)
  uniforms.uHalo.value = atm.halo
  dome.position.copy(cameraPosition)

  hemi.color.copy(atm.hemiSky)
  hemi.groundColor.copy(atm.hemiGround)
  hemi.intensity = atm.hemiIntensity * (1 - SKY_FILL_SHARE) * LIGHT_UNIT
  // The rest of the skylight, aimed down from the sun's side of the sky (see config).
  skyFill.color.copy(atm.hemiSky)
  skyFill.intensity = atm.hemiIntensity * SKY_FILL_SHARE * LIGHT_UNIT
  sunDirection(SKY_FILL_ELEVATION, sunAzimuthOf(atm.sunDir), fillDir)
  skyFill.position.copy(fillDir).multiplyScalar(100)
  sun.color.copy(atm.sunColor)
  sun.intensity = atm.sunIntensity * LIGHT_UNIT
  sun.position.copy(atm.sunDir).multiplyScalar(100) // aims at the default target (origin)

  glow.position.copy(cameraPosition).addScaledVector(atm.sunDir, SUN_GLOW_DISTANCE)
  glow.material.color.copy(atm.sunColor)
  glow.material.opacity = atm.glow

  sceneStats.fogDensity = atm.density
}

/**
 * Sky dome, fog, hemisphere light, sun and sun glow, all set every frame from the
 * atmosphere schedule at the scene's t (a pure function of scroll, no time).
 */
export function Sky({ reducedMotion }: { reducedMotion: boolean }) {
  const parts = useMemo(() => createSkyParts(), [])
  useEffect(() => () => disposeSkyParts(parts), [parts])
  useFrame(({ camera }) => updateSky(parts, camera, sceneProgress(reducedMotion)))

  return (
    <>
      <primitive object={parts.fog} attach="fog" />
      <primitive object={parts.dome} />
      <primitive object={parts.hemi} />
      <primitive object={parts.skyFill} />
      <primitive object={parts.sun} />
      <primitive object={parts.glow} />
    </>
  )
}
