import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  root: 'apps/web',
  envDir: import.meta.dirname,
  plugins: [react()],
  server: {
    // dev: ส่ง /api ต่อไปที่ Elysia (bun run dev:api)
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
