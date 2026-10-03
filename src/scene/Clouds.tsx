import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, type Texture, type Vector3 } from 'three'
import { smoothstep } from '../lib/math'
import { sceneProgress, scrollStore } from '../scroll/scrollStore'
import { atmosphereAt } from './atmosphere'
import { createCloudTexture } from './cloudTexture'
import {
  CLOUD_DECK,
  CLOUD_FADE_FAR,
  CLOUD_FADE_NEAR,
  CLOUD_FLOOR_MOTTLE,
  CLOUD_FLOOR_SHADE,
  CLOUD_FLOOR_TILE,
  CLOUD_FLOOR_Y,
  CLOUD_PLANE_SIZE,
  RENDER_ORDER,
  type CloudDeckPlane,
} from './config'

const frac = (v: number) => v - Math.floor(v)

/**
 * Keep a texture fixed in world space on a plane that follows the camera: the plane moves
 * by (x, z), so shift UVs by the same amount in tiles. (After rotateX(-90deg) the plane's
 * v axis runs along world -z.) Drift is folded in the same way.
 */
function lockTexture(texture: Texture, x: number, z: number, tile: number): void {
  texture.offset.set(frac(x / tile), frac(-z / tile))
}

interface DeckEntry {
  def: CloudDeckPlane
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>
  texture: Texture
  /** |camera.y - plane.y|, reused for sorting. */
  distance: number
}

function createClouds() {
  const source = createCloudTexture()
  const geometry = new PlaneGeometry(CLOUD_PLANE_SIZE, CLOUD_PLANE_SIZE).rotateX(-Math.PI / 2) // up-facing

  // (a) Opaque floor. Front side only: seen from below it is back-face culled (invisible);
  // from above it hides the lower terrain so the peaks rise out of a cloud sea.
  const floorTexture = source.clone() // clones share one image upload
  floorTexture.repeat.setScalar(CLOUD_PLANE_SIZE / CLOUD_FLOOR_TILE)
  const floor = new Mesh(
    geometry,
    new MeshBasicMaterial({ aoMap: floorTexture, aoMapIntensity: CLOUD_FLOOR_MOTTLE, dithering: true }),
  )

  // (b) Translucent deck planes between the cloud base and top.
  const deck: DeckEntry[] = CLOUD_DECK.map((def) => {
    const texture = source.clone()
    texture.repeat.setScalar(CLOUD_PLANE_SIZE / def.tile)
    const mesh = new Mesh(
      geometry,
      // forceSinglePass: a flat plane needs no back-then-front split (saves a draw call each).
      new MeshBasicMaterial({
        alphaMap: texture,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        forceSinglePass: true,
        dithering: true,
      }),
    )
    return { def, mesh, texture, distance: 0 }
  })

  return { source, geometry, floor, floorTexture, deck, order: [...deck] }
}

type CloudParts = ReturnType<typeof createClouds>

function disposeClouds(parts: CloudParts): void {
  parts.geometry.dispose()
  parts.floor.material.dispose()
  for (const d of parts.deck) d.mesh.material.dispose()
  // Clones share the source's image; disposing each releases its GPU binding.
  parts.source.dispose()
  parts.floorTexture.dispose()
  for (const d of parts.deck) d.texture.dispose()
}

function updateClouds(parts: CloudParts, camera: Vector3, t: number, time: number): void {
  const atm = atmosphereAt(t)
  const { floor, floorTexture, deck, order } = parts

  floor.position.set(camera.x, CLOUD_FLOOR_Y, camera.z)
  lockTexture(floorTexture, camera.x, camera.z, CLOUD_FLOOR_TILE)
  floor.material.color.copy(atm.cloud).multiplyScalar(CLOUD_FLOOR_SHADE)

  for (const d of deck) {
    const { def, mesh, texture } = d
    mesh.position.set(camera.x, def.y, camera.z)
    lockTexture(texture, camera.x - def.drift[0] * time, camera.z - def.drift[1] * time, def.tile)
    d.distance = Math.abs(camera.y - def.y)
    // Invisible when nearly edge-on, so the plane never flickers as the camera passes it.
    const opacity = def.opacity * smoothstep(CLOUD_FADE_NEAR, CLOUD_FADE_FAR, d.distance)
    mesh.material.opacity = opacity
    mesh.material.color.copy(atm.cloud)
    mesh.visible = opacity > 0.002
  }

  // Blend far planes first. Explicit renderOrder beats three's own transparent sort.
  order.sort((a, b) => b.distance - a.distance)
  for (let i = 0; i < order.length; i++) order[i]!.mesh.renderOrder = RENDER_ORDER.deck + i
}

/** Cloud floor and translucent deck, re-centered on the camera every frame. */
export function Clouds({ reducedMotion }: { reducedMotion: boolean }) {
  const gl = useThree((s) => s.gl)
  const parts = useMemo(() => createClouds(), [])

  useEffect(() => {
    const anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy())
    for (const texture of [parts.floorTexture, ...parts.deck.map((d) => d.texture)]) {
      texture.anisotropy = anisotropy
      texture.needsUpdate = true
    }
    return () => disposeClouds(parts)
  }, [gl, parts])

  useFrame(({ camera }) =>
    updateClouds(parts, camera.position, sceneProgress(reducedMotion), reducedMotion ? 0 : scrollStore.time),
  )

  return (
    <>
      <primitive object={parts.floor} />
      {parts.deck.map((d) => (
        <primitive key={d.def.y} object={d.mesh} />
      ))}
    </>
  )
}
