# UI audit harness

Screenshots and performance numbers for the hero, captured the same way every time so two
runs can be compared frame for frame. No npm dependencies: it drives the Chrome already
installed on this machine over the DevTools Protocol, using Node's built-in `WebSocket`
(Node 22+).

Start the dev server first, then:

```bash
npm run audit:shots -- --out docs/ui-audit/before
```

```bash
npm run audit:perf -- --out docs/ui-audit/before/perf.json --dpr 1.5
```

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--url` | `http://localhost:5174/` | Where the dev server is |
| `--out` | `docs/ui-audit/before` | Output folder (`shots`) or file (`perf`) |
| `--dpr` | `1` | Device pixel ratio. The real desktop runs at 1.5 |
| `--viewports` | `1132,1440,390` | Any of 1440, 1280, 1132, 1024, 768, 390 |
| `--settle` | `2000` | ms to wait after scrolling before capturing |
| `--step` | `350` | Summit sweep step in px |

`shots` captures the climb offsets from the original audit brief (0 to 6500) and then sweeps
the summit at `--step` to the bottom of the page. It writes `scroll-NNNNN.png` per offset
plus a `shots.json` recording `t`, beat index, triangles and draw calls at each one, so a
visual change can be tied to a scene-state change.

## Reading the numbers

Frame time is vsync-capped: a median of 16.7ms means the frame kept up, not that it had
room to spare. **Throughput is the headroom number**: `perf` launches Chrome with vsync
off and a one-pixel `readPixels` each frame, so the loop is bounded by the GPU finishing,
and records the median and p95 frame time at three poses. The scripted scroll at normal
vsync is useful only as a dropped-frame count (`over33`). `EXT_disjoint_timer_query_webgl2`
is deliberately not used: on the ANGLE / D3D11 backend this was built on it measured query
overhead, not the scene (see the header of `perf.mjs`).

Chrome is launched with `--enable-unsafe-swiftshader` as a fallback, so check
`meta.renderer` in `perf.json`: if it says SwiftShader rather than a real GPU, the numbers
are software rendering and mean nothing.

## Chrome path

`cdp.mjs` hard-codes the standard Windows install path. Change `CHROME` there if yours
differs.

## Port

Every script defaults to `http://localhost:5174/` (start the dev server with
`npm run dev -- --port 5174 --strictPort`). `copyzone.mjs` and `plan.mjs` always use that
address and ignore `--url`.
