import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Don't try to run our integration files (none exist yet) as unit tests.
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` is provided by the Next compiler, not installed as a
      // package, so server modules can't be imported under vitest without it.
      'server-only': path.resolve(
        __dirname,
        './node_modules/next/dist/compiled/server-only/empty.js',
      ),
    },
  },
});
