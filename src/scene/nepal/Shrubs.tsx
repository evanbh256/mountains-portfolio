import { useEffect, useMemo } from 'react'
import { Color, InstancedMesh, Matrix4, SphereGeometry } from 'three'
import { JUNIPER_COLORS, SHRUB_COLORS } from './config'
import { fogCull } from './cull'
import type { FloraPlan } from './floraPlan'
import { basisFromYaw } from './instancing'
import { createPropMaterial } from './materials'

/** One instanced dome field: the same construction for the scrub and for the juniper. */
function createDomes(
  placements: FloraPlan['shrubs'],
  palette: readonly string[],
  segments: [number, number],
  name: string,
) {
  const geometry = new SphereGeometry(1, segments[0], segments[1])
  geometry.deleteAttribute('uv')
  // Neither grows above the cloud base (floraPlan enforces it), so no veil.
  const material = createPropMaterial({ veiled: false })
  const mesh = new InstancedMesh(geometry, material, placements.length)
  const m = new Matrix4()
  const colors = palette.map((c) => new Color(c))

  placements.forEach((item, i) => {
    basisFromYaw(m, item.position, item.normal, item.yaw, item.scale)
    mesh.setMatrixAt(i, m)
    mesh.setColorAt(i, colors[item.color]!)
  })

  mesh.name = name
  mesh.matrixAutoUpdate = false
  mesh.computeBoundingSphere()
  return { mesh, geometry, material }
}

/**
 * Low autumn scrub and, a size up from it, juniper bushes. Two fields of the same instanced
 * dome: the scrub is ankle-high ground cover, the juniper is the waist-high rung between it
 * and the trees, which is the step the size ladder was missing.
 */
export function Shrubs({ plan }: { plan: FloraPlan }) {
  const parts = useMemo(
    () => [
      createDomes(plan.shrubs, SHRUB_COLORS, [6, 4], 'nepal-shrubs'),
      createDomes(plan.junipers, JUNIPER_COLORS, [8, 5], 'nepal-juniper'),
    ],
    [plan],
  )
  useEffect(() => {
    const off = parts.map((p) => fogCull(p.mesh))
    return () => {
      off.forEach((fn) => fn())
      parts.forEach((p) => {
        p.geometry.dispose()
        p.material.dispose()
        p.mesh.dispose()
      })
    }
  }, [parts])

  return (
    <>
      {parts.map((p) => (
        <primitive key={p.mesh.name} object={p.mesh} />
      ))}
    </>
  )
}
