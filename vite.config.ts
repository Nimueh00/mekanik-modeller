import { defineConfig } from 'vitest/config';

export default defineConfig({
  // relative asset URLs: the build works from any sub-directory (GitHub Pages, a USB stick, file server)
  base: './',
  server: { port: 5173, open: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // three-bvh-csg's "main" is a UMD/CJS bundle that require()s three; use its ESM source instead.
    alias: { 'three-bvh-csg': 'three-bvh-csg/src/index.js' },
    server: { deps: { inline: ['three-bvh-csg'] } },
  },
});
