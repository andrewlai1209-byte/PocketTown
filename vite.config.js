import {defineConfig} from 'vite';

export default defineConfig({
  base: './',
  server: {host: '127.0.0.1', port: 5173},
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 640,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.split('\\').join('/');
          if (path.includes('node_modules/three')) return 'engine';
          if (path.includes('/src/sim/')) return 'simulation';
          if (path.includes('/src/brain/') || path.endsWith('/data/connectome.gen.js')) return 'brain';
        },
      },
    },
  },
});
