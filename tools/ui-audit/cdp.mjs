// Minimal Chrome DevTools Protocol client: no npm dependencies.
// Node 22 has a global WebSocket, which is all this needs.

import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PROFILE_PREFIX = 'ui-audit-'

/**
 * Chrome's temp profile is only removed when a run closes cleanly, so every run that times
 * out or is killed leaves one behind - about 36MB each. Thirty-nine of them had accumulated
 * before this was noticed, and 1.4GB of temp files being scanned is enough to make every
 * later run visibly slower. Sweep anything older than an hour at launch, and register the
 * current one for removal on exit however the process ends.
 */
function sweepOldProfiles() {
  const dir = tmpdir()
  const cutoff = Date.now() - 60 * 60 * 1000
  let removed = 0
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(PROFILE_PREFIX)) continue
      const full = join(dir, name)
      try {
        if (statSync(full).mtimeMs > cutoff) continue
        rmSync(full, { recursive: true, force: true })
        removed++
      } catch {
        /* in use by another run, or already gone */
      }
    }
  } catch {
    /* no temp dir listing; not worth failing a capture over */
  }
  return removed
}

export class Session {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = new Map()
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`))
        else p.resolve(msg.result)
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      // Long enough for a slow probe, short enough that a browser which has gone away
      // fails fast. At ten minutes a dead Chrome looks exactly like a slow one, which cost
      // an evening of runs that were not slow at all - they were waiting on nothing.
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout after 150s: ${method}`))
      }, 150000)
    })
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push(fn)
  }

  once(method, predicate = () => true) {
    return new Promise((resolve) => {
      const fn = (params) => {
        if (!predicate(params)) return
        const arr = this.listeners.get(method)
        arr.splice(arr.indexOf(fn), 1)
        resolve(params)
      }
      this.on(method, fn)
    })
  }

  /** Evaluate an async expression in the page and return its value. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (r.exceptionDetails) {
      throw new Error(`page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    }
    return r.result.value
  }
}

/**
 * Fail every outstanding call if Chrome goes away, instead of letting them sit until the
 * timeout. A browser that has crashed is indistinguishable from a slow one otherwise.
 */
function wireFailures(session, ws, child) {
  const fail = (why) => {
    for (const [, p] of session.pending) p.reject(new Error(`Chrome went away: ${why}`))
    session.pending.clear()
  }
  ws.addEventListener('close', () => fail('devtools socket closed'))
  child.once('exit', (code, signal) => fail(`process exited (code ${code ?? signal})`))
}

export async function launch({ port = 9333, width = 1440, height = 900, unthrottled = false } = {}) {
  sweepOldProfiles()
  const profile = mkdtempSync(join(tmpdir(), PROFILE_PREFIX))
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--enable-unsafe-swiftshader',
      '--use-angle=default',
      // Benchmarking only: without these every frame waits for the display and the whole
      // scene measures 16.7ms whatever it costs. With them, rAF runs as fast as the scene
      // can be drawn, so the frame rate is a throughput number.
      ...(unthrottled ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let wsUrl = null
  for (let i = 0; i < 100; i++) {
    await sleep(200)
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl
        break
      }
    } catch {
      /* not up yet */
    }
  }
  if (!wsUrl) throw new Error('Chrome did not expose a page target')

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })


  const session = new Session(ws)
  wireFailures(session, ws, child)
  await session.send('Page.enable')
  await session.send('Runtime.enable')

  const cleanup = () => {
    try {
      child.kill()
    } catch {
      /* already gone */
    }
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      /* Chrome may still be releasing it; the next run's sweep will get it */
    }
  }
  // However this process ends - finished, thrown, interrupted - the profile goes with it.
  process.once('exit', cleanup)
  process.once('SIGINT', () => { cleanup(); process.exit(130) })
  process.once('SIGTERM', () => { cleanup(); process.exit(143) })

  const close = () => {
    try {
      ws.close()
    } catch {
      /* ignore */
    }
    child.kill()
    setTimeout(cleanup, 500)
  }

  return { session, close }
}

export { sleep }
