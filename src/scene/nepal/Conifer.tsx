import { useEffect, useMemo } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'
import { CONIFER, CONIFER_BARK, CONIFER_NEEDLE } from './config'
import { fogCull } from './cull'
import { type FloraPlan } from './floraPlan'
import { createPropMaterial } from './materials'

/**
 * The canopy: stacked cones from `tierBase` to the tip, each narrower than the one below and
 * overlapping it, merged into one geometry so a whole grove is a single draw call.
 *
 * Built at unit height, so an instance's scale is the tree's height straight from the plan.
 */
function createTiersGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  const base = CONIFER.tierBase
  const span = 1 - base
  // Each tier is taller than its share of the span by `overlap`, so the skirts interleave
  // rather than sitting on each other like a stack of hats.
  const tierSpan = span / CONIFER.tiers
  const tierHeight = tierSpan * (1 + CONIFER.overlap)

  for (let i = 0; i < CONIFER.tiers; i++) {
    const radius = (CONIFER.radius / CONIFER.height) * Math.pow(CONIFER.taper, i)
    const y = base + i * tierSpan
    // The topmost tier tapers to the leader rather than to a blunt cone.
    const h = i === CONIFER.tiers - 1 ? tierHeight * 1.35 : tierHeight
    const cone = new ConeGeometry(radius, h, 7, 1, true)
    cone.deleteAttribute('uv')
    cone.translate(0, y + h / 2, 0)
    parts.push(cone)
  }

  // Merge by hand: mergeGeometries lives in three's examples, which this project does not pull in.
  let vertexCount = 0
  for (const g of parts) vertexCount += g.getAttribute('position').count
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  let w = 0
  for (const g of parts) {
    const pos = g.getAttribute('position')
    const nor = g.getAttribute('normal')
    for (let i = 0; i < pos.count; i++) {
      positions.set([pos.getX(i), pos.getY(i), pos.getZ(i)], (w + i) * 3)
      normals.set([nor.getX(i), nor.getY(i), nor.getZ(i)], (w + i) * 3)
    }
    w += pos.count
    g.dispose()
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.computeBoundingSphere()
  return geometry
}

function createConifers(plan: FloraPlan) {
  const count = plan.conifers.length
  const trunkGeometry = new CylinderGeometry(0.62, 1, 1, 6, 1, true).translate(0, 0.5, 0)
  trunkGeometry.deleteAttribute('uv')
  const tiersGeometry = createTiersGeometry()

  const trunkMaterial = createPropMaterial({ color: CONIFER_BARK, veiled: false })
  const needleMaterial = createPropMaterial({ color: CONIFER_NEEDLE, veiled: false })

  const trunks = new InstancedMesh(trunkGeometry, trunkMaterial, count)
  const tiers = new InstancedMesh(tiersGeometry, needleMaterial, count)

  const m = new Matrix4()
  const q = new Quaternion()
  const e = new Euler()
  const s = new Vector3()
  const p = new Vector3()

  plan.conifers.forEach((tree, i) => {
    const height = CONIFER.height * tree.scale
    const r = CONIFER.trunkRadius * tree.scale
    // A slight lean, about the axis across the tree's own facing, so a grove is not a row
    // of identical masts.
    q.setFromEuler(e.set(tree.tilt, tree.yaw, tree.tilt * 0.6))

    // The trunk only has to reach the lowest tier; above that the canopy hides it.
    m.compose(p.copy(tree.position), q, s.set(r, height * (CONIFER.tierBase + 0.12), r))
    trunks.setMatrixAt(i, m)

    m.compose(p.copy(tree.position), q, s.setScalar(height))
    tiers.setMatrixAt(i, m)
  })

  for (const mesh of [trunks, tiers]) {
    mesh.matrixAutoUpdate = false
    mesh.computeBoundingSphere()
  }
  trunks.name = 'nepal-conifer-trunks'
  tiers.name = 'nepal-conifer-tiers'

  return {
    meshes: [trunks, tiers],
    geometries: [trunkGeometry, tiersGeometry],
    materials: [trunkMaterial, needleMaterial],
  }
}

type ConiferParts = ReturnType<typeof createConifers>

function disposeConifers(parts: ConiferParts): void {
  parts.geometries.forEach((g) => g.dispose())
  parts.materials.forEach((mat) => mat.dispose())
  parts.meshes.forEach((mesh) => mesh.dispose())
}

/**
 * Fir and deodar in groves on the lower slopes: the tall, narrow, dark species that gives
 * the broad crimson rhododendron something to be broad and crimson against.
 */
export function Conifer({ plan }: { plan: FloraPlan }) {
  const parts = useMemo(() => createConifers(plan), [plan])
  useEffect(() => {
    const unregister = parts.meshes.map(fogCull)
    return () => {
      unregister.forEach((off) => off())
      disposeConifers(parts)
    }
  }, [parts])

  return (
    <>
      {parts.meshes.map((mesh) => (
        <primitive key={mesh.name} object={mesh} />
      ))}
    </>
  )
}
