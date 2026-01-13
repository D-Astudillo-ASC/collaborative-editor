import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Relied on default vendor chunking, which often pulls large deps (Monaco) into a single big bundle.
    //
    // Reason for change:
    // - Production-grade caching/perf: split Monaco/Yjs/MUI/Clerk into stable, separately cached chunks.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // Monaco editor + React wrapper (dominant payload)
          if (id.includes('monaco-editor') || id.includes('@monaco-editor/react')) {
            return 'monaco';
          }

          // Collaboration stack
          if (
            id.includes('yjs') ||
            id.includes('y-monaco') ||
            id.includes('y-protocols') ||
            id.includes('lib0')
          ) {
            return 'yjs';
          }

          // UI stack
          if (id.includes('@mui') || id.includes('@emotion')) {
            return 'mui';
          }

          // Auth
          if (id.includes('@clerk')) {
            return 'clerk';
          }

          return 'vendor';
        },
      },
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['@monaco-editor/react'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  worker: {
    format: 'es',
  }
})
