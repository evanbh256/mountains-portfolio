import { useEffect } from 'react'
import { useNepalFlags } from '../scene/nepal/flags'

/**
 * Puts `nepal-ui` on the document element while the UI accents are on, which is the only
 * thing that switches the accent rules in index.css. With the flag off the class is gone
 * and every rule under it stops applying, so the page is exactly what it was before.
 */
export function NepalAccents() {
  const { uiAccents } = useNepalFlags()

  useEffect(() => {
    if (!uiAccents) return
    const root = document.documentElement
    root.classList.add('nepal-ui')
    return () => root.classList.remove('nepal-ui')
  }, [uiAccents])

  return null
}
