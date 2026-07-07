import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        // Static marketing landing page served at linelist.org/
        main: resolve(__dirname, 'index.html'),
        // The React application, served at linelist.org/app/
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
})
