// YouTube's IFrame Player API, loaded on first use: the music pill (MusicPill.tsx) asks for it
// once the page is idle, so it never competes with the page's own first load.

export interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  setVolume(volume: number): void
  getIframe(): HTMLIFrameElement
  destroy(): void
}

interface YTPlayerOptions {
  host?: string
  videoId: string
  width?: number
  height?: number
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (e: { target: YTPlayer }) => void
    onStateChange?: (e: { data: number; target: YTPlayer }) => void
    onError?: (e: { data: number }) => void
  }
}

interface YTNamespace {
  Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/** YT.PlayerState, the values onStateChange reports. */
export const YT_STATE = { unstarted: -1, ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 } as const

let api: Promise<YTNamespace> | null = null

export function loadYouTube(): Promise<YTNamespace> {
  api ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT) resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      api = null // a later press tries again
      script.remove()
      reject(new Error('the YouTube player API did not load'))
    }
    document.head.append(script)
  })
  return api
}
