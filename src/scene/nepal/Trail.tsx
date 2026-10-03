import { useEffect, useMemo } from 'react'
import {
  BoxGeometry,
  BufferAttribute,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  type BufferGeometry,
} from 'three'
import { TRAIL_COLORS } from './config'
import { fogCull } from './cull'
import { basisFromForward } from './instancing'
import { createPropMaterial } from './materials'
import type { PlacedStone, TrailPlan } from './trailPlan'

/**
 * Darken a geometry toward its underside, so a stone reads as seated in the ground rather
 * than resting on top of it. This is the contact shade the audit asked for, and it costs a
 * vertex-colour attribute rather than a shadow pass: baked ambient occlusion for an object
 * whose relationship to the ground never changes.
 */
function addContactShade(geometry: BufferGeometry, floor: number): BufferGeometry {
  const pos = geometry.getAttribute('position')
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < pos.count; i++) {
    lo = Math.min(lo, pos.getY(i))
    hi = Math.max(hi, pos.getY(i))
  }
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const u = hi > lo ? (pos.getY(i) - lo) / (hi - lo) : 1
    const shade = floor + (1 - floor) * Math.pow(u, 0.65)
    colors.set([shade, shade, shade], i * 3)
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

function createStones(name: string, geometry: BufferGeometry, stones: PlacedStone[]) {
  // The trail stops below the cloud base, so it never needs the veil.
  const material = createPropMaterial({ veiled: false, vertexColors: true })
  const mesh = new InstancedMesh(geometry, material, stones.length)
  const m = new Matrix4()
  const colors = TRAIL_COLORS.map((c) => new Color(c))
  stones.forEach((s, i) => {
    basisFromForward(m, s.position, s.normal, s.forward, s.scale)
    mesh.setMatrixAt(i, m)
    mesh.setColorAt(i, colors[s.color]!)
  })
  mesh.name = name
  mesh.matrixAutoUpdate = false
  mesh.computeBoundingSphere()
  return { mesh, geometry, material }
}

function createTrail(plan: TrailPlan) {
  const slabBox = new BoxGeometry(1, 1, 1)
  slabBox.deleteAttribute('uv')
  addContactShade(slabBox, 0.55)
  const edgeRock = new IcosahedronGeometry(0.5, 0)
  edgeRock.deleteAttribute('uv')
  addContactShade(edgeRock, 0.62)
  return {
    slabs: createStones('nepal-trail-slabs', slabBox, plan.slabs),
    edges: createStones('nepal-trail-edges', edgeRock, plan.edges),
  }
}

type TrailParts = ReturnType<typeof createTrail>

function disposeTrail(parts: TrailParts): void {
  for (const part of [parts.slabs, parts.edges]) {
    part.geometry.dispose()
    part.material.dispose()
    part.mesh.dispose()
  }
}

/** Flat slabs draped along the climb, with rougher stones along the edges. */
export function Trail({ plan }: { plan: TrailPlan }) {
  const parts = useMemo(() => createTrail(plan), [plan])
  useEffect(() => {
    const unregister = [fogCull(parts.slabs.mesh), fogCull(parts.edges.mesh)]
    return () => {
      unregister.forEach((off) => off())
      disposeTrail(parts)
    }
  }, [parts])

  return (
    <>
      <primitive object={parts.slabs.mesh} />
      <primitive object={parts.edges.mesh} />
    </>
  )
}
