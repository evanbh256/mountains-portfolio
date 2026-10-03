// Aerial perspective: air thins with altitude, so distance alone does not decide how much
// haze a surface picks up. A valley floor washes out while the ridge above it stays crisp.
// three's fog knows only view depth, which veils a whole mountain evenly and flattens it.
//
// The fix is to hand the fog an optical depth instead of a distance: view depth times the
// mean air density along the ray. Patching three's fog_vertex chunk does it for every
// fogged material at once - three's own shaders, this scene's, and the Nepal layer's
// patched fog_fragment, which reads the same vFogDepth - at a few instructions per vertex
// and none per fragment.

import { ShaderChunk } from 'three'
import { FOG_MEAN_MAX, FOG_MEAN_MIN, FOG_SCALE_HEIGHT } from './config'

const f = (v: number) => v.toFixed(3)

let installed = false

/**
 * Replace fog_vertex so vFogDepth carries optical depth. Call once before any material
 * compiles; calling it again does nothing.
 *
 * Density is exp(-(y - camera.y) / H), measured from the camera so a level ray comes out
 * at exactly the old view depth and the density schedule in config.ts keeps its meaning.
 * Along a ray that rises by dy the mean density is (1 - exp(-a)) / a with a = dy / H
 * (and 1 in the limit a -> 0). FogExp2 squares depth, so the sqrt puts that mean straight
 * into the exponent.
 *
 * World y comes from mvPosition and the view matrix - a rigid transform, so its inverse is
 * the transpose - which needs no new uniform and stays correct for instanced, batched and
 * skinned geometry. It does need mvPosition in scope, which every stock vertex shader that
 * includes fog_vertex has.
 */
export function installAerialFog(): void {
  if (installed) return
  installed = true
  ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  float fogWorldY = dot( viewMatrix[ 1 ].xyz, mvPosition.xyz - viewMatrix[ 3 ].xyz );
  float fogRise = ( fogWorldY - cameraPosition.y ) / ${f(FOG_SCALE_HEIGHT)};
  float fogMean = abs( fogRise ) < 1e-3 ? 1.0 - 0.5 * fogRise : ( 1.0 - exp( -fogRise ) ) / fogRise;
  vFogDepth = -mvPosition.z * sqrt( clamp( fogMean, ${f(FOG_MEAN_MIN)}, ${f(FOG_MEAN_MAX)} ) );
#endif
`
}
