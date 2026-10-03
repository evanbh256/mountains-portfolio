import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    /**
     * Parallel sessions on this folder each get their own free port from the desktop app,
     * passed in PORT (launch.json "autoPort"). Vite does not read PORT on its own. Held
     * strictly when given, so a taken port fails loudly instead of drifting to one the preview
     * is not watching; without PORT, Vite's default (5173, or the next free port) applies.
     * A --port flag on the command line still wins over both.
     */
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    strictPort: Boolean(process.env.PORT),
    watch: {
      /**
       * The dev server watches the project root, so writing a screenshot or a note while a
       * capture is running reloads the page underneath it - which shows up as a probe
       * failing on a null #scroll-root, or as a frame captured mid-reload. Nothing outside
       * src/ and index.html is part of the app.
       */
      ignored: ['**/docs/**', '**/tools/**', '**/dist/**', '**/.git/**'],
    },
  },
  build: {
    // three.js + R3F form one lazily loaded scene chunk (~880 kB minified, ~240 kB gzip);
    // the page's own chunk stays small. Raise the warning threshold above that on purpose.
    chunkSizeWarningLimit: 1000,
  },
})
