import { useEffect, useMemo } from 'react'
import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three'
import { lerp } from '../lib/math'
import { IS_LOW } from '../lib/quality'
import { ROCKS } from './config'
import { routeSamples } from './grassPlan'
import { mulberry32 } from './noise'
import { colorAt, surfaceHeightAt, surfaceSlopeAt } from './terrain.ts'

/**
 * One boulder: an icosahedron with every vertex pushed in or out a little, flat-shaded so
 * the facets catch the light. Three of them, so a field of rocks is not one rock repeated.
 */
function rockGeometry(seed: number): IcosahedronGeometry {
  const geometry = new IcosahedronGeometry(1, 1)
  const rand = mulberry32(seed)
  const position = geometry.getAttribute('position')
  const v = new Vector3()
  // The same vertex appears once per face here (non-indexed), so displace by direction, not
  // by index, or the faces come apart.
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i)
    const key = Math.abs(Math.round(v.x * 7) * 131 + Math.round(v.y * 7) * 17 + Math.round(v.z * 7))
    const push = 0.72 + 0.5 * mulberry32(seed + key)()
    v.multiplyScalar(push)
    position.setXYZ(i, v.x, v.y * 0.78, v.z) // squat, the way a settled boulder sits
  }
  geometry.computeVertexNormals()
  void rand
  return geometry
}

function createRocks() {
  const count = Math.round(ROCKS.COUNT * (IS_LOW ? ROCKS.LOW_SCALE : 1))
  const route = routeSamples(200)
  const rand = mulberry32(8123)
  const material = new MeshLambertMaterial({ flatShading: true, dithering: true })
  const geometries = [rockGeometry(11), rockGeometry(29), rockGeometry(53)]
  const meshes = geometries.map((g) => new InstancedMesh(g, material, Math.ceil(count / geometries.length)))
  const placed = geometries.map(() => 0)

  const matrix = new Matrix4()
  const quaternion = new Quaternion()
  const scale = new Vector3()
  const position = new Vector3()
  const tint = new Color()
  const tumble = new Vector3()

  let guard = 0
  let total = 0
  while (total < count && guard++ < count * 30) {
    const s = route[Math.floor(rand() * (route.length - 1))]!
    const side = rand() < 0.5 ? -1 : 1
    const across = ROCKS.CLEAR + Math.pow(rand(), 1.5) * (ROCKS.BAND - ROCKS.CLEAR)
    const x = s.x - s.tz * across * side
    const z = s.z + s.tx * across * side
    const slope = surfaceSlopeAt(x, z)
    if (slope > ROCKS.MAX_SLOPE) continue
    // Scree gathers where the ground steepens, so rocks get likelier as grass gives up.
    if (rand() > 0.25 + slope * 1.6) continue

    const which = total % geometries.length
    const i = placed[which]!
    if (i >= meshes[which]!.count) {
      total++
      continue
    }
    const size = lerp(ROCKS.SIZE[0], ROCKS.SIZE[1], Math.pow(rand(), 2.2))
    position.set(x, surfaceHeightAt(x, z) - size * 0.38, z) // half-buried, not resting on top
    scale.set(size * lerp(0.8, 1.3, rand()), size * lerp(0.6, 1, rand()), size * lerp(0.8, 1.3, rand()))
    tumble.set(rand() - 0.5, rand() * 4, rand() - 0.5).normalize()
    quaternion.setFromAxisAngle(tumble, rand() * Math.PI * 2)
    matrix.compose(position, quaternion, scale)
    meshes[which]!.setMatrixAt(i, matrix)

    // The rock takes the ground's own color at that height, steepened so it reads as bare.
    colorAt(tint, x, position.y, z, Math.min(1, slope + 0.45))
    tint.multiplyScalar(lerp(0.82, 1.12, rand()))
    meshes[which]!.setColorAt(i, tint)
    placed[which] = i + 1
    total++
  }

  for (let k = 0; k < meshes.length; k++) {
    const mesh = meshes[k]!
    mesh.count = placed[k]! // trim the tail that was never filled
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.matrixAutoUpdate = false
  }
  return { meshes, material, geometries }
}

type RockParts = ReturnType<typeof createRocks>

function disposeRocks(parts: RockParts): void {
  for (const m of parts.meshes) m.dispose()
  for (const g of parts.geometries) g.dispose()
  parts.material.dispose()
}

/** Boulders and scree along the route: static, so they cost one draw call each. */
export function Rocks() {
  const parts = useMemo(() => createRocks(), [])
  useEffect(() => () => disposeRocks(parts), [parts])

  return (
    <>
      {parts.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}
