import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TOOL_SLUGS } from './src/utils/appRoutes'

/**
 * Gives each tool a real address on a static host: linelist.org/app/epicurve/
 * and so on. GitHub Pages serves files only, so the built app page is copied
 * into one folder per tool; the app reads the address and opens that tool.
 * In development the same addresses are rewritten to the app page.
 */
function toolRoutes(): Plugin {
  const slugs = Object.values(TOOL_SLUGS)
  let outDir = 'dist'
  return {
    name: 'linelist-tool-routes',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? '').split('?')
        const segment = path.match(/^\/app\/([^/.]+)\/?$/)?.[1]?.toLowerCase()
        if (segment && (slugs as string[]).includes(segment)) {
          req.url = '/app/index.html' + (query ? `?${query}` : '')
        }
        next()
      })
    },
    async closeBundle() {
      const appPage = await readFile(resolve(outDir, 'app/index.html'), 'utf8')
      for (const slug of slugs) {
        await mkdir(resolve(outDir, 'app', slug), { recursive: true })
        await writeFile(resolve(outDir, 'app', slug, 'index.html'), appPage)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), toolRoutes()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        // Static marketing landing page served at linelist.org/
        main: resolve(__dirname, 'index.html'),
        // The React application, served at linelist.org/app/ and, as copies,
        // at linelist.org/app/<tool>/ (see toolRoutes above)
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
})
