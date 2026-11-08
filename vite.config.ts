import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dailyPepPWA } from './scripts/pwa';

export default defineConfig({
  base: './',
  plugins: [react(), dailyPepPWA()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    clearMocks: true,
  },
});
