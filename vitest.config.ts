import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    clearMocks: true,
    environment: 'jsdom',
    globals: true,
    include: [
      'src/**/*.test.{ts,tsx,js,jsx}',
      'scripts/**/*.test.{ts,tsx,js,jsx}',
      'server/**/*.test.{ts,tsx,js,jsx}',
    ],
    restoreMocks: true,
    setupFiles: ['./src/setupTests.ts'],
  },
});
