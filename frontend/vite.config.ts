import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // Exit if port is already in use
  },
  test: {
    // Unit tests of pure logic (money, dates, projections): no DOM needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Dates are formatted in local time; pin it so results don't depend on the machine.
    env: { TZ: 'America/Toronto' },
  },
})
