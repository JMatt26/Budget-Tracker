import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_API_URL is inlined at build time. Fail the production build if it is
  // missing instead of deploying a site that calls http://localhost:8000.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (mode === 'production' && !env.VITE_API_URL?.trim()) {
    throw new Error(
      'VITE_API_URL is not set. Set it (e.g. in Vercel project settings) to the API URL before building for production.'
    )
  }

  return {
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
  }
})
