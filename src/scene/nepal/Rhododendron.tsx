import { useEffect, useMemo } from 'react'
import {
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { CRIMSON, CROWN_GREEN, TREE, TRUNK_BARK } from './config'
import { fogCull } from './cull'
import { crownRadius, type FloraPlan } from './floraPlan'
import { createPropMaterial } from './materials'

/** A sphere pushed in and out by the same profile the blossoms are placed on. */
function createCrownGeometry() {
  const geometry = new SphereGeometry(1, 9, 6)
  geometry.deleteAttribute('uv')
  const pos = geometry.getAttribute('position')
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    // Depends only on direction, so vertices shared across the seam move together.
    v.multiplyScalar(crownRadius(v.x, v.y, v.z))
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function createRhododendron(plan: FloraPlan) {
  const trunkGeometry = new CylinderGeometry(0.75, 1, 1, 6, 1, true).translate(0, 0.5, 0)
  trunkGeometry.deleteAttribute('uv')
  const crownGeometry = createCrownGeometry()
  const blossomGeometry = new OctahedronGeometry(1, 0)
  blossomGeometry.deleteAttribute('uv')

  // Rhododendron is a lower-slope tree; floraPlan rejects any that reach the cloud.
  const trunkMaterial = createPropMaterial({ color: TRUNK_BARK, veiled: false })
  const crownMaterial = createPropMaterial({ color: CROWN_GREEN, veiled: false })
  const blossomMaterial = createPropMaterial({ color: CRIMSON, veiled: false })

  const trunks = new InstancedMesh(trunkGeometry, trunkMaterial, plan.trees.length)
  const crowns = new InstancedMesh(crownGeometry, crownMaterial, plan.trees.length)
  const blossoms = new InstancedMesh(blossomGeometry, blossomMaterial, plan.blossoms.length)

  const m = new Matrix4()
  const q = new Quaternion()
  const e = new Euler()
  const s = new Vector3()
  const p = new Vector3()

  plan.trees.forEach((tree, i) => {
    const r = TREE.trunkRadius * tree.scale
    // Trunks stand upright even on a slope, sunk a little so no seam shows.
    m.compose(
      p.copy(tree.position).setY(tree.position.y - 0.3),
      q.setFromEuler(e.set(0, tree.yaw, 0)),
      s.set(r, (TREE.crownY * tree.scale + 0.3) * 0.95, r),
    )
    trunks.setMatrixAt(i, m)

    const cr = TREE.crownRadius * tree.scale
    m.compose(
      p.copy(tree.position).setY(tree.position.y + TREE.crownY * tree.scale),
      q.setFromEuler(e.set(0, tree.yaw, 0)),
      s.set(cr * TREE.crownSpread, cr * TREE.crownFlatten, cr * TREE.crownSpread),
    )
    crowns.setMatrixAt(i, m)
  })

  plan.blossoms.forEach((b, i) => {
    m.compose(b.position, q.setFromEuler(e.set(b.pitch, b.yaw, 0)), s.setScalar(b.scale))
    blossoms.setMatrixAt(i, m)
  })

  for (const mesh of [trunks, crowns, blossoms]) {
    mesh.matrixAutoUpdate = false
    mesh.computeBoundingSphere()
  }
  trunks.name = 'nepal-tree-trunks'
  crowns.name = 'nepal-tree-crowns'
  blossoms.name = 'nepal-blossoms'

  return {
    meshes: [trunks, crowns, blossoms],
    geometries: [trunkGeometry, crownGeometry, blossomGeometry],
    materials: [trunkMaterial, crownMaterial, blossomMaterial],
  }
}

type TreeParts = ReturnType<typeof createRhododendron>

function disposeRhododendron(parts: TreeParts): void {
  parts.geometries.forEach((g) => g.dispose())
  parts.materials.forEach((mat) => mat.dispose())
  parts.meshes.forEach((mesh) => mesh.dispose())
}

/** Rhododendrons in bloom: dark trunk, lumpy crown, crimson blossoms over its surface. */
export function Rhododendron({ plan }: { plan: FloraPlan }) {
  const parts = useMemo(() => createRhododendron(plan), [plan])
  useEffect(() => {
    const unregister = parts.meshes.map(fogCull)
    return () => {
      unregister.forEach((off) => off())
      disposeRhododendron(parts)
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
