import { useEffect, useMemo } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  LineSegments,
  Matrix4,
  PlaneGeometry,
  Sphere,
  Vector3,
} from 'three'
import {
  CORD,
  HALF_DENSITY,
  FLAG_COLORS,
  FLAG_FRAY,
  FLAG_SEGMENTS_DESKTOP,
  FLAG_SEGMENTS_MOBILE,
  POLE_RADIUS,
  POLE_WOOD,
} from './config'
import { fogCull } from './cull'
import { createCordMaterial, createFlagMaterial, createPropMaterial } from './materials'
import type { PlacedFlagSet } from './plan'

const DOWN = new Vector3(0, -1, 0)

/**
 * Unit flag: x in [-0.5, 0.5] along the cord, y in [-1, 0] hanging below it. The bounding
 * sphere is centered on the cord and wide enough for any swing the shader can apply (a
 * rotation about the cord of up to 90 degrees, plus fray and ripple), so the instanced
 * mesh is never culled while a flag is still on screen.
 */
function createFlagGeometry(): BufferGeometry {
  const [cols, rows] = HALF_DENSITY ? FLAG_SEGMENTS_MOBILE : FLAG_SEGMENTS_DESKTOP
  const geometry = new PlaneGeometry(1, 1, cols, rows).translate(0, -0.5, 0)
  geometry.deleteAttribute('uv')
  geometry.boundingSphere = new Sphere(new Vector3(), Math.hypot(0.5, 1 + FLAG_FRAY) + 0.15)
  return geometry
}

function createFlagMesh(set: PlacedFlagSet, base: BufferGeometry, material: ReturnType<typeof createFlagMaterial>) {
  const geometry = base.clone()
  const count = set.flags.length
  const data = new Float32Array(count * 4)
  const mesh = new InstancedMesh(geometry, material, count)
  const m = new Matrix4()
  const hang = new Vector3()
  const up = new Vector3()
  const normal = new Vector3()
  const x = new Vector3()
  const colors = FLAG_COLORS.map((c) => new Color(c))

  const tint = new Color()
  set.flags.forEach((flag, i) => {
    const { top, tangent, size } = flag
    hang.copy(DOWN).addScaledVector(tangent, -DOWN.dot(tangent)).normalize()
    up.copy(hang).negate()
    normal.crossVectors(tangent, up).normalize()
    // Each panel is cut and faded a little differently; a string of identical ones reads
    // as printed tape rather than as cloth.
    const w = size.w * flag.sizeW
    const h = size.h * flag.sizeH
    m.makeBasis(x.copy(tangent).multiplyScalar(w), up.multiplyScalar(h), normal.multiplyScalar(h))
    m.setPosition(top)
    mesh.setMatrixAt(i, m)
    tint.copy(colors[flag.color]!).multiplyScalar(flag.tone)
    mesh.setColorAt(i, tint)
    data.set([flag.s, flag.phase, flag.amp, flag.glow], i * 4)
  })

  geometry.setAttribute('aFlag', new InstancedBufferAttribute(data, 4))
  mesh.name = `nepal-flags-${set.id}`
  mesh.matrixAutoUpdate = false
  mesh.computeBoundingSphere()
  return mesh
}

/** Every cord as one line list: a single draw call. */
function createCords(sets: PlacedFlagSet[]) {
  let segments = 0
  for (const set of sets) for (const c of set.cords) segments += c.length - 1
  const positions = new Float32Array(segments * 6)
  let w = 0
  for (const set of sets) {
    for (const c of set.cords) {
      for (let i = 1; i < c.length; i++) {
        const a = c[i - 1]!
        const b = c[i]!
        positions.set([a.x, a.y, a.z, b.x, b.y, b.z], w)
        w += 6
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.computeBoundingSphere()
  const material = createCordMaterial(CORD)
  const cords = new LineSegments(geometry, material)
  cords.name = 'nepal-cords'
  cords.matrixAutoUpdate = false
  return { cords, geometry, material }
}

/** Every pole as one instanced, slightly tapered six-sided post. */
function createPoles(sets: PlacedFlagSet[]) {
  const poles = sets.flatMap((s) => s.poles)
  const geometry = new CylinderGeometry(0.7, 1, 1, 6, 1, true).translate(0, 0.5, 0)
  geometry.deleteAttribute('uv')
  const material = createPropMaterial({ color: POLE_WOOD })
  const mesh = new InstancedMesh(geometry, material, poles.length)
  const m = new Matrix4()
  poles.forEach((p, i) => {
    m.makeScale(POLE_RADIUS, p.height, POLE_RADIUS).setPosition(p.base)
    mesh.setMatrixAt(i, m)
  })
  mesh.name = 'nepal-poles'
  mesh.matrixAutoUpdate = false
  mesh.computeBoundingSphere()
  return { mesh, geometry, material }
}

function createPrayerFlags(sets: PlacedFlagSet[]) {
  const base = createFlagGeometry()
  const material = createFlagMaterial()
  const meshes = sets.filter((s) => s.flags.length > 0).map((s) => createFlagMesh(s, base, material))
  base.dispose()
  return { meshes, material, cords: createCords(sets), poles: createPoles(sets) }
}

type FlagParts = ReturnType<typeof createPrayerFlags>

function disposePrayerFlags(parts: FlagParts): void {
  for (const mesh of parts.meshes) {
    mesh.geometry.dispose()
    mesh.dispose()
  }
  parts.material.dispose()
  parts.cords.geometry.dispose()
  parts.cords.material.dispose()
  parts.poles.geometry.dispose()
  parts.poles.material.dispose()
  parts.poles.mesh.dispose()
}

/** Strings of flags, their cords and poles, built once for the given sets. */
export function PrayerFlags({ sets }: { sets: PlacedFlagSet[] }) {
  const parts = useMemo(() => createPrayerFlags(sets), [sets])
  useEffect(() => {
    const unregister = parts.meshes.map(fogCull)
    return () => {
      unregister.forEach((off) => off())
      disposePrayerFlags(parts)
    }
  }, [parts])

  return (
    <>
      {parts.meshes.map((mesh) => (
        <primitive key={mesh.name} object={mesh} />
      ))}
      <primitive object={parts.cords.cords} />
      <primitive object={parts.poles.mesh} />
    </>
  )
}
