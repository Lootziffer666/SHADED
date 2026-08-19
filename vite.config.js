import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig(({ mode }) => ({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: mode === 'production' ? 'terser' : false,
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: mode === 'production'
      }
    },
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor/index.html'
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          'spatial-kernel': [
            'src/runtime/spatial-kernel/kernel.js',
            'src/runtime/spatial-kernel/observation.js',
            'src/runtime/spatial-kernel/observation-store.js',
            'src/runtime/spatial-kernel/recipe-manager.js'
          ],
          'reconstruction': [
            'src/runtime/reconstruction/depth-provider.js',
            'src/runtime/reconstruction/mesh-pipeline.js',
            'src/runtime/reconstruction/patch-registration.js'
          ],
          'world-simulation': [
            'src/runtime/simulation/world-law-solver.js',
            'src/runtime/simulation/sparse-field.js',
            'src/runtime/simulation/world-fields.js'
          ]
        }
      }
    },
    target: 'es2022',
    modulePreload: {
      polyfill: true
    }
  },
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11'],
      renderLegacyChunks: true,
      polyfills: ['es.promise', 'es.array.iterator', 'web.dom-collections.iterator']
    })
  ],
  resolve: {
    alias: {
      '@': '/src',
      '@runtime': '/src/runtime',
      '@kernel': '/src/runtime/spatial-kernel',
      '@recon': '/src/runtime/reconstruction',
      '@sim': '/src/runtime/simulation',
      '@editor': '/src/editor'
    }
  },
  server: {
    port: 8000,
    open: false,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  worker: {
    format: 'es',
    plugins: () => []
  }
}));