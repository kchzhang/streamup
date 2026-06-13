import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { setupMockPlugins } from './mock'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue(), vueDevTools(), ...setupMockPlugins(mode === 'development')],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api/chat': {
          target: env.VITE_CHAT_API_TARGET,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/chat/, '/v2/chat/completions'),
        },
      },
    },
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'Streams',
        formats: ['es', 'cjs'],
        fileName: (format) => `streams.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rollupOptions: {
        external: ['vue', '@tanstack/vue-virtual'],
        output: {
          globals: {
            vue: 'Vue',
            '@tanstack/vue-virtual': 'TanStackVirtual',
          },
        },
      },
    },
  }
})
