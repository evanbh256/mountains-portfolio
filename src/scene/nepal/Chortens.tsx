import { useEffect, useMemo } from 'react'
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { buildChortenGeometry } from './chortenGeometry'
import { createPropMaterial } from './materials'
import type { PlacedChorten } from './plan'

const Y = new Vector3(0, 1, 0)

function createChortens(chortens: PlacedChorten[]) {
  const geometry = buildChortenGeometry()
  const material = createPropMaterial({ vertexColors: true })
  const mesh = new InstancedMesh(geometry, material, chortens.length)
  const m = new Matrix4()
  const q = new Quaternion()
  const s = new Vector3()
  chortens.forEach((c, i) => {
    m.compose(c.position, q.setFromAxisAngle(Y, c.yaw), s.setScalar(c.scale))
    mesh.setMatrixAt(i, m)
  })
  mesh.name = 'nepal-chortens'
  mesh.matrixAutoUpdate = false
  mesh.computeBoundingSphere()
  return { mesh, geometry, material }
}

/** The summit chorten and the small wayside ones: one geometry, one draw call. */
export function Chortens({ chortens }: { chortens: PlacedChorten[] }) {
  const parts = useMemo(() => createChortens(chortens), [chortens])
  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.material.dispose()
      parts.mesh.dispose()
    },
    [parts],
  )
  return <primitive object={parts.mesh} />
}
