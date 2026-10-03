import { NEPAL_FLAG_KEYS, setAllNepalFlags, setNepalFlag, useNepalFlags } from '../scene/nepal/flags'

/** Debug HUD switches for the Nepali detail layer (one per feature, plus all on/off). */
export function NepalHudSection() {
  const flags = useNepalFlags()
  const allOn = NEPAL_FLAG_KEYS.every((k) => flags[k])

  return (
    <fieldset className="mt-2 border-t border-white/20 pt-2">
      <legend className="sr-only">Nepal layer</legend>
      <div className="mb-1 flex items-center justify-between">
        <span>nepal</span>
        <button
          type="button"
          onClick={() => setAllNepalFlags(!allOn)}
          className="rounded border border-white/30 px-2 py-0.5 hover:bg-white/15"
        >
          {allOn ? 'All off' : 'All on'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {NEPAL_FLAG_KEYS.map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={(e) => setNepalFlag(key, e.currentTarget.checked)}
              className="accent-white"
            />
            {key}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
