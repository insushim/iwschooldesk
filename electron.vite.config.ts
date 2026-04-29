import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename2 = fileURLToPath(import.meta.url)
const __dirname2 = dirname(__filename2)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname2, 'electron/main.ts')
        },
        external: ['electron', 'better-sqlite3', 'koffi', 'path', 'fs', 'os', 'crypto', 'node:module', 'node:crypto', 'node:path', 'node:fs', 'node:os', 'node:url']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname2, 'electron/preload.ts')
        },
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname2, 'index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname2, 'src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
