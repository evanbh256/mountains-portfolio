// Materials for the Nepali layer: stock Lambert extended through onBeforeCompile, so the
// scene's FogExp2 and lights keep working unchanged. Every material gets extras that keep
// color the exception and respect the cloud layer:
//   - the scene fog, exactly as the terrain gets it, with desaturation toward grey as it
//     closes in (distant accents fade to mist rather than to tinted mist)
//   - the terrain's cloud-band tint, so anything near the cloud layer blends like the ground
//   - a cloud veil: while the camera is below the cloud base, anything above the cloud
//     dissolves out (hashed alpha, as if behind cloud) instead of showing through the gaps
//     in the deck. It follows the camera's height through the band, inside the whiteout.
// Flag materials also flutter in the vertex shader and glow when the sun is behind them.

import { Color, DoubleSide, LineBasicMaterial, MeshLambertMaterial, Vector2, Vector3 } from 'three'
import { CLOUD_BAND_TINT, CLOUD_BASE_Y, CLOUD_TOP_Y, SUMMIT_Y } from '../config'
import { BACKLIGHT, CLOUD_VEIL, DISTANCE_DESATURATION, FLAG_FRAY, WIND } from './config'

const f = (v: number) => v.toFixed(3)

/** Shared by every Nepali material; written once per frame by NepalLayer. */
export const nepalUniforms = {
  uCloudColor: { value: new Color() },
  uSunDir: { value: new Vector3(0, 0, -1) },
  /** Sun color x intensity. */
  uSunLight: { value: new Color() },
  uWindDir: { value: new Vector2(...WIND.direction).normalize() },
  uWindStrength: { value: WIND.base as number },
  uWindPhase: { value: WIND.staticPhase as number },
}

/* ---------------------------- common ---------------------------- */

const COMMON_VERTEX_PARS = /* glsl */ `
varying float vNepalWorldY;
`

const COMMON_VERTEX = /* glsl */ `
{
  vec4 nepalWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    nepalWorld = instanceMatrix * nepalWorld;
  #endif
  vNepalWorldY = (modelMatrix * nepalWorld).y;
}
`

const COMMON_FRAGMENT_PARS = /* glsl */ `
uniform vec3 uCloudColor;
varying float vNepalWorldY;
`

// Before alphahash_fragment: the veil drives alpha, the hash discards, then alpha is reset
// so no partially transparent pixel ever reaches the (alpha-enabled) canvas. The veil lifts
// while the camera climbs from 1 to 5 units above the cloud base (t ~ 0.57-0.61), the
// densest part of the whiteout, so the dissolve itself is never seen.
const CLOUD_VEIL_ALPHA = /* glsl */ `
{
  float nepalVeil = smoothstep(${f(CLOUD_BASE_Y + 1)}, ${f(CLOUD_BASE_Y + 5)}, vNepalWorldY)
    * (1.0 - smoothstep(${f(CLOUD_BASE_Y + 1)}, ${f(CLOUD_BASE_Y + 5)}, cameraPosition.y));
  diffuseColor.a *= 1.0 - ${f(CLOUD_VEIL)} * nepalVeil;
}
`

// Same band and strength as the terrain material (Terrain.tsx), applied at the same point.
const CLOUD_TINT = /* glsl */ `
{
  float cloudBand = smoothstep(${f(CLOUD_BASE_Y - 2)}, ${f(CLOUD_BASE_Y + 2)}, vNepalWorldY)
    * (1.0 - smoothstep(${f(CLOUD_TOP_Y)}, ${f(CLOUD_TOP_Y + 6)}, vNepalWorldY));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uCloudColor, cloudBand * ${f(CLOUD_BAND_TINT)});
}
`

// Replaces three's fog_fragment: the same fog factor and blend, with desaturation first.
const FOG = /* glsl */ `
#ifdef USE_FOG
{
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  float nepalLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(nepalLuma), fogFactor * ${f(DISTANCE_DESATURATION)});
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
}
#endif
`

/* ---------------------------- flags ----------------------------- */

// Per instance, aFlag = (arc position of the flag center along its cord, random phase,
// flutter amplitude, backlight multiplier). The unit flag hangs from its cord along local
// y in [-1, 0]; the instance matrix scales x by the width and y, z by the hang depth, so a
// rotation about the cord (local x) stays a rotation in the world.
const FLAG_VERTEX_PARS = /* glsl */ `
attribute vec4 aFlag;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uWindPhase;
varying float vFlagGlow;
`

// After beginnormal_vertex: swing angle about the cord, and the matching normal.
const FLAG_NORMAL = /* glsl */ `
  float flagV = clamp(-position.y, 0.0, 1.0);
  #ifdef USE_INSTANCING
    vec3 flagOrigin = instanceMatrix[3].xyz;
    vec3 flagNormalW = normalize(instanceMatrix[2].xyz);
    float flagWidth = length(instanceMatrix[0].xyz);
  #else
    vec3 flagOrigin = vec3(0.0);
    vec3 flagNormalW = vec3(0.0, 0.0, 1.0);
    float flagWidth = 1.0;
  #endif
  float flagS = aFlag.x + position.x * flagWidth;
  float flagPhase = uWindPhase;
  float flagAlt = mix(1.0, ${f(WIND.altitudeBoost)}, smoothstep(0.0, ${f(SUMMIT_Y)}, flagOrigin.y));
  float flagStrength = uWindStrength * aFlag.z * flagAlt;
  // Waves travel along the cord; a slow envelope stands in for low-frequency noise.
  float flagWave = 0.55 * sin(0.9 * flagS - 2.1 * flagPhase + aFlag.y)
                 + 0.30 * sin(2.3 * flagS - 3.7 * flagPhase + 1.7 * aFlag.y + 1.3 * flagV)
                 + 0.15 * sin(4.1 * flagS - 5.3 * flagPhase + 2.9 * aFlag.y + 2.1 * flagV);
  float flagSlow = 0.7 + 0.3 * sin(0.31 * flagPhase + 0.05 * aFlag.x + aFlag.y);
  float flagLean = dot(uWindDir, normalize(flagNormalW.xz + vec2(1e-5)));
  float flagTheta = clamp(flagStrength * (0.42 * flagLean + 0.5 * flagWave * flagSlow), -1.25, 1.25);
  float flagRipple = flagStrength * 0.07 * flagV * sin(9.0 * position.x - 6.0 * flagPhase + 3.0 * flagV + aFlag.y);
  objectNormal = vec3(0.0, sin(flagTheta), cos(flagTheta));
  vFlagGlow = aFlag.w;
`

// After begin_vertex: swing about the cord (the attached edge never moves, the free edge
// moves most), plus a ripple and a ragged bottom edge.
const FLAG_POSITION = /* glsl */ `
  float flagFray = step(0.999, flagV) * ${f(FLAG_FRAY)}
    * fract(sin(dot(vec2(position.x, aFlag.y), vec2(12.9898, 78.233))) * 43758.5453);
  float flagDrop = flagV + flagFray;
  transformed.y = -flagDrop * cos(flagTheta);
  transformed.z = flagDrop * sin(flagTheta) + flagRipple;
`

const FLAG_FRAGMENT_PARS = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunLight;
varying float vFlagGlow;
`

// Before opaque_fragment: light through the cloth when the sun is behind the flag.
const FLAG_BACKLIGHT = /* glsl */ `
{
  vec3 flagView = normalize(-vViewPosition);
  vec3 flagSun = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float flagBack = pow(max(dot(flagView, flagSun), 0.0), ${f(BACKLIGHT.power)});
  outgoingLight += diffuseColor.rgb * uSunLight * (${f(BACKLIGHT.strength)} * vFlagGlow * flagBack);
}
`

/* --------------------------- builders --------------------------- */

/**
 * `veiled` props can end up above the cloud and need the dissolve. Props the plan keeps
 * below the cloud base skip it, which also keeps their shaders free of a discard: a shader
 * that can discard gives up early-z, and these cover a lot of screen.
 */
function patch<M extends MeshLambertMaterial | LineBasicMaterial>(material: M, flag: boolean, veiled = true): M {
  material.alphaHash = veiled
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, nepalUniforms)
    let vs = shader.vertexShader.replace('#include <common>', `#include <common>\n${COMMON_VERTEX_PARS}`)
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>\n${COMMON_VERTEX}`)
    let fs = shader.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON_FRAGMENT_PARS}`)
    if (veiled) {
      fs = fs.replace(
        '#include <alphahash_fragment>',
        `${CLOUD_VEIL_ALPHA}\n#include <alphahash_fragment>\ndiffuseColor.a = 1.0;`,
      )
    }
    fs = fs.replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${CLOUD_TINT}`)
    fs = fs.replace('#include <fog_fragment>', FOG)
    if (flag) {
      vs = vs.replace('#include <common>', `#include <common>\n${FLAG_VERTEX_PARS}`)
      vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${FLAG_NORMAL}`)
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${FLAG_POSITION}`)
      fs = fs.replace('#include <common>', `#include <common>\n${FLAG_FRAGMENT_PARS}`)
      fs = fs.replace('#include <opaque_fragment>', `${FLAG_BACKLIGHT}\n#include <opaque_fragment>`)
    }
    shader.vertexShader = vs
    shader.fragmentShader = fs
  }
  material.customProgramCacheKey = () => `${flag ? 'nepal-flag' : 'nepal-prop'}${veiled ? '' : '-plain'}`
  return material
}

/** Cloth: per-instance color, both sides lit, opaque. */
export function createFlagMaterial(): MeshLambertMaterial {
  return patch(new MeshLambertMaterial({ side: DoubleSide }), true)
}

/**
 * Solid props: faceted like the terrain, colored per vertex or per instance. Pass
 * `veiled: false` for anything the plan guarantees stays below the cloud base.
 */
export function createPropMaterial(
  options: { vertexColors?: boolean; color?: string; veiled?: boolean } = {},
): MeshLambertMaterial {
  return patch(
    new MeshLambertMaterial({
      flatShading: true,
      vertexColors: options.vertexColors ?? false,
      color: options.color ?? '#ffffff',
    }),
    false,
    options.veiled ?? true,
  )
}

/** Cords: plain lines with the same fog, veil and cloud tint as everything else. */
export function createCordMaterial(color: string): LineBasicMaterial {
  return patch(new LineBasicMaterial({ color }), false)
}
