import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, Mesh, MeshLambertMaterial } from 'three'
import { sceneProgress } from '../scroll/scrollStore'
import { atmosphereAt } from './atmosphere'
import {
  CLOUD_BAND_NEAR,
  CLOUD_BAND_TINT,
  CLOUD_BASE_Y,
  CLOUD_TOP_Y,
  FAR_RANGES,
  ROCK_CREASE,
  ROCK_MOTTLE,
  ROCK_RELIEF,
  ROCK_RELIEF_FADE,
  ROCK_RELIEF_SCALE,
  ROCK_STRATA_AMOUNT,
  ROCK_STRATA_FREQ,
  SNOW_CARVE_RELIEF,
  SNOW_CARVE_SCALE,
  SNOW_CARVE_STRETCH,
  SNOW_DRIFT_FADE,
  SNOW_DRIFT_RELIEF,
  SNOW_DRIFT_SCALE,
  SNOW_DRIFT_STRETCH,
  SNOW_SHADE,
  TERRAIN_BANDS,
  TERRAIN_COLORS,
  WIND_DIR,
} from './config'
import { buildFarRangeGeometry, buildTerrainGeometry } from './terrain.ts'

const f = (v: number) => v.toFixed(3)
const rgb = (hex: string) => {
  const c = new Color(hex) // Color stores linear, which is the space the shader works in
  return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`
}

/**
 * Value noise on a hash, not on sin(), which bands on some drivers at large coordinates.
 * `rockField` is the relief the normal gets bent by: projected down on flat ground and
 * sideways on cliffs, so a rock face gets vertical grain instead of smeared-out blobs.
 */
const NOISE = /* glsl */ `
  float rockHash(vec2 p) {
    vec3 q = fract(vec3(p.x, p.y, p.x) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float rockNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 g = fract(p);
    vec2 u = g * g * (3.0 - 2.0 * g);
    return mix(mix(rockHash(i), rockHash(i + vec2(1.0, 0.0)), u.x),
               mix(rockHash(i + vec2(0.0, 1.0)), rockHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float rockField(vec3 wp, float steep, float scale) {
    float ground = rockNoise(wp.xz / scale);
    float face = rockNoise(vec2((wp.x + wp.z) * 0.7, wp.y * 1.4) / scale);
    return mix(ground, face, steep);
  }
`

/**
 * Lambert, with the things a grid this coarse cannot give on its own. In the order the
 * fragment shader reaches them:
 *
 *   relief     - the normal bent by noise, projected to suit the slope, and sastrugi carved
 *                across the wind wherever snow lies. Smooth-shaded ground with no relief
 *                reads as clay, and each triangle's linear shading shows as a seam.
 *                Fades out with distance, where the detail would be sub-pixel and crawl.
 *   surface    - strata, grain, crease shade, and snow on whatever the relief left facing
 *                up, so the snow line is ragged instead of a contour.
 *   occlusion  - baked sky occlusion (see opennessField in terrain.ts) on indirect light
 *                only, so gullies sit in shade and ridges catch the sky. With the sun near
 *                the horizon almost everything is sky-lit, and without this the whole
 *                mountain face lights evenly and loses its form.
 *   cloud band - ground inside the cloud band (CLOUD_BASE_Y..CLOUD_TOP_Y) blended toward the
 *                current cloud color, so peaks rise softly out of the cloud sea instead of
 *                showing a dark collar where they cut the flat cloud floor. Only at
 *                distance: the slope at your feet is seen directly, not through the band.
 */
function createTerrainMaterial(cloudColor: { value: Color }): MeshLambertMaterial {
  const B = TERRAIN_BANDS
  // dithering: the fog gradient covers huge smooth areas, which otherwise shows as 8-bit
  // banding (flat regions meeting in straight lines). Costs one noise sample per fragment.
  const material = new MeshLambertMaterial({ vertexColors: true, dithering: true })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCloudColor = cloudColor
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aOpenness;
        varying float vOpenness;
        varying vec3 vWorldPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vOpenness = aOpenness;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uCloudColor;
        varying float vOpenness;
        varying vec3 vWorldPos;
        ${NOISE}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float rockSteep = smoothstep(${f(B.steep[0])}, ${f(B.steep[1])}, 1.0 - normal.y);
        float reliefFade = 1.0 - smoothstep(${f(ROCK_RELIEF_FADE[0])}, ${f(ROCK_RELIEF_FADE[1])}, length(vViewPosition));
        float rockDetail = 0.5;
        if (reliefFade > 0.002) {
          // Forward difference on the relief field gives the slope to tilt the normal by.
          const float e = 0.45;
          rockDetail = rockField(vWorldPos, rockSteep, ${f(ROCK_RELIEF_SCALE)});
          float dx = rockField(vWorldPos + vec3(e, 0.0, 0.0), rockSteep, ${f(ROCK_RELIEF_SCALE)}) - rockDetail;
          float dz = rockField(vWorldPos + vec3(0.0, 0.0, e), rockSteep, ${f(ROCK_RELIEF_SCALE)}) - rockDetail;
          vec3 slope = vec3(dx, 0.0, dz) / e;
          normal = normalize(normal - (slope - dot(slope, normal) * normal) * ${f(ROCK_RELIEF)} * reliefFade);
        }

        // Snow lies on whatever the relief left facing up, so the line is ragged.
        float snowMask = smoothstep(${f(B.snow[0])}, ${f(B.snow[1])}, vWorldPos.y + (rockDetail - 0.5) * 9.0)
          * (1.0 - smoothstep(${f(B.snowSlope[0])}, ${f(B.snowSlope[1])}, 1.0 - normal.y));
        float snowCarve = 0.5;
        float snowDrift = 0.5;
        if (snowMask > 0.01) {
          // Drifts: the broad form the wind leaves across a snowfield. Coarse enough to
          // survive at distance, which is what stops the far snow reading as a flat sheet.
          const float e3 = 1.2;
          vec2 dAlong = normalize(vec2(${f(WIND_DIR[0])}, ${f(WIND_DIR[1])}));
          vec2 dAcross = vec2(dAlong.y, -dAlong.x);
          vec2 dp = vec2(dot(vWorldPos.xz, dAcross), dot(vWorldPos.xz, dAlong) * ${f(SNOW_DRIFT_STRETCH)}) / ${f(SNOW_DRIFT_SCALE)};
          snowDrift = rockNoise(dp);
          vec2 dg = vec2(rockNoise(dp + vec2(e3, 0.0)) - snowDrift, rockNoise(dp + vec2(0.0, e3)) - snowDrift) / e3;
          vec3 drift = vec3(dg.x * dAcross.x + dg.y * dAlong.x, 0.0, dg.x * dAcross.y + dg.y * dAlong.y);
          normal = normalize(normal - (drift - dot(drift, normal) * normal) * ${f(SNOW_DRIFT_RELIEF)} * snowMask * max(${f(SNOW_DRIFT_FADE)}, reliefFade));
        }
        if (snowMask > 0.01 && reliefFade > 0.35) { // carving is fine detail: nearest ground only
          // Sastrugi: ripples across the wind, drawn out downwind.
          const float e2 = 0.16;
          vec2 along = normalize(vec2(${f(WIND_DIR[0])}, ${f(WIND_DIR[1])}));
          vec2 across = vec2(along.y, -along.x);
          vec2 sp = vec2(dot(vWorldPos.xz, across), dot(vWorldPos.xz, along) * ${f(SNOW_CARVE_STRETCH)}) / ${f(SNOW_CARVE_SCALE)};
          snowCarve = rockNoise(sp);
          vec2 g = vec2(rockNoise(sp + vec2(e2, 0.0)) - snowCarve, rockNoise(sp + vec2(0.0, e2)) - snowCarve) / e2;
          vec3 carve = vec3(g.x * across.x + g.y * along.x, 0.0, g.x * across.y + g.y * along.y);
          normal = normalize(normal - (carve - dot(carve, normal) * normal) * ${f(SNOW_CARVE_RELIEF)} * snowMask * reliefFade);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float grain = rockNoise(vWorldPos.xz / ${f(ROCK_MOTTLE.coarseScale)}) - 0.5;
          grain += (rockNoise(vWorldPos.xz / ${f(ROCK_MOTTLE.fineScale)}) - 0.5) * ${f(ROCK_MOTTLE.fineAmount / ROCK_MOTTLE.coarseAmount)} * reliefFade;
          diffuseColor.rgb *= 1.0 + grain * ${f(2.0 * ROCK_MOTTLE.coarseAmount)};

          // Bedding lines, warped by the relief so they follow the rock, not the world.
          float strata = sin(vWorldPos.y * ${f(ROCK_STRATA_FREQ)} + rockDetail * 4.0);
          diffuseColor.rgb *= 1.0 + strata * ${f(ROCK_STRATA_AMOUNT)} * rockSteep;
          // Crevices: the low half of the relief field, darkened.
          diffuseColor.rgb *= 1.0 - ${f(ROCK_CREASE)} * reliefFade * max(0.0, 0.5 - rockDetail) * 2.0;

          // Snow, with the troughs of the carving left cold and blue. The drift field
          // shades the broad hollows the same way, so the field has form as well as grain.
          vec3 snowTone = mix(${rgb(SNOW_SHADE)}, ${rgb(TERRAIN_COLORS.snow)}, smoothstep(0.2, 0.8, snowCarve));
          snowTone *= 0.9 + 0.2 * smoothstep(0.25, 0.75, snowDrift);
          diffuseColor.rgb = mix(diffuseColor.rgb, snowTone, snowMask);
        }`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vOpenness;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float cloudBand = smoothstep(${f(CLOUD_BASE_Y - 2)}, ${f(CLOUD_BASE_Y + 2)}, vWorldPos.y)
          * (1.0 - smoothstep(${f(CLOUD_TOP_Y)}, ${f(CLOUD_TOP_Y + 6)}, vWorldPos.y))
          * smoothstep(${f(CLOUD_BAND_NEAR[0])}, ${f(CLOUD_BAND_NEAR[1])}, length(vViewPosition));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uCloudColor, cloudBand * ${f(CLOUD_BAND_TINT)});`,
      )
  }
  return material
}

/** The ground, plus the horizon ranges beyond it. One material, built once. */
export function Terrain({ reducedMotion }: { reducedMotion: boolean }) {
  const parts = useMemo(() => {
    const cloudColor = { value: new Color() }
    const material = createTerrainMaterial(cloudColor)
    const mesh = new Mesh(buildTerrainGeometry(), material)
    const ranges = FAR_RANGES.map((_, i) => new Mesh(buildFarRangeGeometry(i), material))
    for (const m of [mesh, ...ranges]) {
      m.matrixAutoUpdate = false
      m.updateMatrix()
    }
    return { mesh, ranges, material, cloudColor }
  }, [])

  useEffect(
    () => () => {
      parts.mesh.geometry.dispose()
      for (const r of parts.ranges) r.geometry.dispose()
      parts.material.dispose()
    },
    [parts],
  )

  useFrame(() => {
    parts.cloudColor.value.copy(atmosphereAt(sceneProgress(reducedMotion)).cloud)
  })

  return (
    <>
      <primitive object={parts.mesh} />
      {parts.ranges.map((r, i) => (
        <primitive key={i} object={r} />
      ))}
    </>
  )
}
