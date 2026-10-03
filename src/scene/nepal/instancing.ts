// Shared instance-matrix helpers. Build-time only.

import { Matrix4, Vector3 } from 'three'

const x = new Vector3()
const y = new Vector3()
const z = new Vector3()

/**
 * Seat an instance on the ground: local +y along the surface normal and local +z along
 * `forward`, which must already lie in the surface plane. Columns carry the scale.
 */
export function basisFromForward(
  m: Matrix4,
  position: Vector3,
  normal: Vector3,
  forward: Vector3,
  scale: Vector3,
): Matrix4 {
  y.copy(normal).normalize()
  z.copy(forward).addScaledVector(y, -forward.dot(y)).normalize()
  x.crossVectors(y, z)
  m.makeBasis(x.multiplyScalar(scale.x), y.multiplyScalar(scale.y), z.multiplyScalar(scale.z))
  return m.setPosition(position)
}

/** The same, with the facing given as a turn about the normal instead of a vector. */
export function basisFromYaw(
  m: Matrix4,
  position: Vector3,
  normal: Vector3,
  yaw: number,
  scale: Vector3,
): Matrix4 {
  return basisFromForward(m, position, normal, z.set(Math.sin(yaw), 0, Math.cos(yaw)).clone(), scale)
}
