import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Vector2,
  type Vector3,
} from 'three'
import { perf } from '../lib/perfGuard'
import { IS_LOW } from '../lib/quality'
import { GRASS } from './config'
import { buildGrassPlan } from './grassPlan'
import { WIND_DIR, WIND_GUST_SCALE } from './config'
import { wind } from './wind'

const f = (v: number) => v.toFixed(3)
const rgb = (hex: string) => {
  const c = new Color(hex)
  return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`
}

/**
 * One blade, normalised: y runs 0 at the root to 1 at the tip, and the instance matrix
 * scales it to the blade's own height. Width tapers to a point and the blade leans forward
 * a little, so even a still field does not look like a bed of nails.
 */
function bladeGeometry(segments: number): BufferGeometry {
  const rows = segments + 1
  const positions = new Float32Array(rows * 2 * 3)
  const normals = new Float32Array(rows * 2 * 3)
  for (let r = 0; r < rows; r++) {
    const v = r / segments
    const halfWidth = (GRASS.WIDTH / 2) * (1 - Math.pow(v, 1.4))
    const lean = 0.12 * v * v
    for (let side = 0; side < 2; side++) {
      const k = (r * 2 + side) * 3
      positions[k] = side === 0 ? -halfWidth : halfWidth
      positions[k + 1] = v
      positions[k + 2] = lean
      // Mostly up, tilted toward the blade's face: grass lit like the ground it grows on
      // reads soft, where a true edge-on normal turns every blade into a black sliver.
      normals[k] = 0
      normals[k + 1] = 0.82
      normals[k + 2] = 0.57
    }
  }

  const index = new Uint16Array(segments * 6)
  let w = 0
  for (let r = 0; r < segments; r++) {
    const a = r * 2
    index[w++] = a
    index[w++] = a + 1
    index[w++] = a + 2
    index[w++] = a + 1
    index[w++] = a + 3
    index[w++] = a + 2
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  return geometry
}

interface WindUniforms {
  uWindPhase: { value: number }
  uWindStrength: { value: number }
  uWindDir: { value: Vector2 }
}

/**
 * Lambert with the blade built in the vertex shader: yaw from the instance attribute, then
 * a downwind bend that grows with the square of the height up the blade, the way a stem
 * actually bends. Gusts travel across the field because the phase is offset by the blade's
 * position along the wind direction - the same phase and strength the prayer flags use.
 */
function createGrassMaterial(uniforms: WindUniforms): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ dithering: true })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aBlade; // yaw, height, dryness
        uniform float uWindPhase;
        uniform float uWindStrength;
        uniform vec2 uWindDir;
        varying vec3 vGrassColor;
        varying float vGrassUp;
        vec2 yawXZ(vec2 p, float c, float s) { return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        float bladeCos = cos(aBlade.x);
        float bladeSin = sin(aBlade.x);
        objectNormal.xz = yawXZ(objectNormal.xz, bladeCos, bladeSin);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float bladeUp = position.y;
        transformed.xz = yawXZ(transformed.xz, bladeCos, bladeSin);
        vec2 rootXZ = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        float gust = sin(uWindPhase + dot(rootXZ, uWindDir) * ${f((2 * Math.PI) / WIND_GUST_SCALE)});
        float bend = bladeUp * bladeUp * uWindStrength * (0.55 + 0.45 * gust) * ${f(GRASS.BEND)};
        transformed.xz += uWindDir * bend;
        transformed.y -= bend * bend * 0.45; // the tip swings on an arc, it does not stretch
        vGrassUp = bladeUp;
        vGrassColor = mix(${rgb(GRASS.COLORS.base)},
          mix(${rgb(GRASS.COLORS.tip)}, ${rgb(GRASS.COLORS.dry)}, aBlade.z), bladeUp);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrassColor;
        varying float vGrassUp;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Darker at the root, where a real tuft shades itself.
        diffuseColor.rgb *= vGrassColor * (0.55 + 0.45 * smoothstep(0.0, 0.55, vGrassUp));`,
      )
  }
  return material
}

function createGrass() {
  const uniforms: WindUniforms = {
    uWindPhase: { value: 0 },
    uWindStrength: { value: 1 },
    uWindDir: { value: new Vector2(...WIND_DIR).normalize() },
  }
  const material = createGrassMaterial(uniforms)
  // Two blades: the near one bends over its segments, the far one is a single quad. A blade
  // three pixels tall does not need three segments, and swapping them at LOD_DISTANCE takes
  // two thirds of the triangles out of the half of the field that cannot show the detail.
  const base = bladeGeometry(IS_LOW ? GRASS.LOW_SEGMENTS : GRASS.SEGMENTS)
  const far = bladeGeometry(GRASS.FAR_SEGMENTS)
  const matrix = new Matrix4()

  const meshes = buildGrassPlan().map((chunk) => {
    // Each chunk needs its own geometry for its own instance attribute, but they all share
    // the blade's position, normal and index buffers.
    // Both detail levels share this chunk's instance attribute, so swapping between them
    // is a reference change rather than a re-upload.
    const aBlade = new InstancedBufferAttribute(chunk.blades, 3)
    const variant = (src: BufferGeometry) => {
      const g = new BufferGeometry()
      g.setAttribute('position', src.getAttribute('position'))
      g.setAttribute('normal', src.getAttribute('normal'))
      g.setIndex(src.getIndex())
      g.setAttribute('aBlade', aBlade)
      return g
    }
    const geometry = variant(base)
    const geometryFar = variant(far)

    const mesh = new InstancedMesh(geometry, material, chunk.count)
    mesh.userData.near = geometry
    mesh.userData.far = geometryFar
    for (let i = 0; i < chunk.count; i++) {
      const h = chunk.blades[i * 3 + 1]!
      matrix.makeScale(h, h, h)
      matrix.setPosition(chunk.positions[i * 3]!, chunk.positions[i * 3 + 1]!, chunk.positions[i * 3 + 2]!)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere() // a chunk covers one stretch of the route, so culling works
    mesh.matrixAutoUpdate = false
    return mesh
  })

  return { meshes, material, base, far, uniforms }
}

type GrassParts = ReturnType<typeof createGrass>

function disposeGrass(parts: GrassParts): void {
  for (const m of parts.meshes) {
    ;(m.userData.near as BufferGeometry).dispose()
    ;(m.userData.far as BufferGeometry).dispose()
    m.dispose()
  }
  parts.base.dispose()
  parts.far.dispose()
  parts.material.dispose()
}

function updateGrass(parts: GrassParts, camera: Vector3): void {
  parts.uniforms.uWindPhase.value = wind.phase
  parts.uniforms.uWindStrength.value = wind.strength
  // Chunks well behind or ahead of the climb are deep in fog; skip their vertices entirely.
  const reach = perf.level > 0 ? GRASS.GUARDED_DISTANCE : GRASS.DRAW_DISTANCE
  for (const mesh of parts.meshes) {
    const sphere = mesh.boundingSphere!
    const distance = camera.distanceTo(sphere.center) - sphere.radius
    mesh.visible = distance < reach
    if (!mesh.visible) continue
    const wanted = (distance > GRASS.LOD_DISTANCE ? mesh.userData.far : mesh.userData.near) as BufferGeometry
    if (mesh.geometry !== wanted) mesh.geometry = wanted
  }
}

/** Tufted alpine grass along the trail, leaning in the scene's one wind. */
export function Grass() {
  const parts = useMemo(() => createGrass(), [])
  useEffect(() => () => disposeGrass(parts), [parts])

  useFrame(({ camera }) => updateGrass(parts, camera.position))

  return (
    <>
      {parts.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}
