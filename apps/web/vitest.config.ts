import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Force esbuild for JSX transform (tsconfig has jsx: "preserve" for Next.js)
  esbuild: {
    jsx: 'automatic',
  },
  // Disable oxc so esbuild handles JSX
  oxc: false as any,
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
