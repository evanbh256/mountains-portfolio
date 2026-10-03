import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { sceneProgress, scrollStore } from '../../scroll/scrollStore'
import { atmosphereAt } from '../atmosphere'
import { Chortens } from './Chortens'
import { Conifer } from './Conifer'
import { updateFogCull } from './cull'
import { useNepalFlags } from './flags'
import { getFloraPlan } from './floraPlan'
import { getNepalPlan } from './plan'
import { PrayerFlags } from './PrayerFlags'
import { Rhododendron } from './Rhododendron'
import { Shrubs } from './Shrubs'
import { Trail } from './Trail'
import { getTrailPlan } from './trailPlan'
import { updateNepalUniforms } from './wind'

/**
 * Wind, sun and cloud values for every Nepali material, from the shared ticker, and the
 * fog cull. Mounted after SceneDirector, so the camera is already posed for this frame.
 */
function NepalAtmosphere({ reducedMotion }: { reducedMotion: boolean }) {
  useFrame(({ camera }) => {
    const t = sceneProgress(reducedMotion)
    updateNepalUniforms(t, scrollStore.dt, scrollStore.velocity, reducedMotion)
    updateFogCull(camera, atmosphereAt(t).density)
  })
  return null
}

/**
 * The Nepali detail layer: additive props composed along the camera path. Each feature
 * mounts only while its flag is on, and each plan is built the first time it is needed,
 * so with every 3D flag off this renders nothing and computes nothing.
 */
export function NepalLayer({ reducedMotion }: { reducedMotion: boolean }) {
  const flags = useNepalFlags()
  const showFlora = flags.rhododendron || flags.shrubs
  const any = flags.prayerFlags || flags.chorten || flags.trail || showFlora

  const plan = useMemo(() => (flags.prayerFlags || flags.chorten ? getNepalPlan() : null), [flags.prayerFlags, flags.chorten])
  // Beat 5's cords are tied to the summit chorten's spire, so they need the chorten.
  const flagSets = useMemo(() => (plan ? (flags.chorten ? [...plan.sets, plan.radial] : plan.sets) : []), [flags.chorten, plan])
  const trail = useMemo(() => (flags.trail ? getTrailPlan() : null), [flags.trail])
  const flora = useMemo(() => (showFlora ? getFloraPlan() : null), [showFlora])

  if (!any) return null

  return (
    <>
      <NepalAtmosphere reducedMotion={reducedMotion} />
      {flags.prayerFlags && plan && <PrayerFlags sets={flagSets} />}
      {flags.chorten && plan && <Chortens chortens={plan.chortens} />}
      {trail && <Trail plan={trail} />}
      {flags.rhododendron && flora && <Rhododendron plan={flora} />}
      {flags.rhododendron && flora && flora.conifers.length > 0 && <Conifer plan={flora} />}
      {flags.shrubs && flora && <Shrubs plan={flora} />}
    </>
  )
}
