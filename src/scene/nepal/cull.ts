// Fog culling: once the fog lets less than FOG_CULL_VISIBILITY of a prop through at its
// nearest point, it renders as fog color to within a fraction of one 8-bit step, and so
// does the (deeper) ground behind it, so skipping its draw call changes nothing visible.
// Depth is view depth, the quantity the fog uses, and the test is conservative: no point of
// the bounding sphere can be shallower than (center depth - radius).

import { type Camera, type InstancedMesh, Vector3 } from 'three'
import { FOG_MEAN_MIN } from '../config'
import { FOG_CULL_VISIBILITY } from './config'

const culled = new Set<InstancedMesh>()
const forward = new Vector3()
const center = new Vector3()
/**
 * exp(-(density * depth)^2) < v  <=>  density * depth > sqrt(-ln v).
 *
 * The scene's fog is aerial (src/scene/fog.ts): air thins with altitude, so a prop high
 * above the camera collects less haze than its distance suggests, by at worst a factor of
 * FOG_MEAN_MIN on the squared depth. Dividing the reach by its square root keeps the test
 * conservative for a prop anywhere, not only at or below the camera.
 */
const FOG_REACH = Math.sqrt(-Math.log(FOG_CULL_VISIBILITY)) / Math.sqrt(FOG_MEAN_MIN)

/** Register a static instanced mesh (identity transform). Returns an unregister. */
export function fogCull(mesh: InstancedMesh): () => void {
  culled.add(mesh)
  return () => {
    culled.delete(mesh)
    mesh.visible = true
  }
}

export function updateFogCull(camera: Camera, fogDensity: number): void {
  const reach = FOG_REACH / Math.max(fogDensity, 1e-6)
  camera.getWorldDirection(forward)
  for (const mesh of culled) {
    const sphere = mesh.boundingSphere
    if (!sphere) continue
    const nearest = center.copy(sphere.center).sub(camera.position).dot(forward) - sphere.radius
    mesh.visible = nearest < reach
  }
}
