import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // อ่าน .env ที่ root (ทุกชื่อ) แต่ส่งให้หน้าเว็บเฉพาะ URL + anon key ของ Supabase
  // SUPABASE_SECRET_KEY ห้ามหลุดมาฝั่งเว็บเด็ดขาด — จึงไม่ใช้ envPrefix 'SUPABASE_'
  const env = { ...loadEnv(mode, import.meta.dirname, ''), ...process.env }
  const exposed = {
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '',
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '',
  }

  return {
    root: 'apps/web',
    envDir: import.meta.dirname,
    define: Object.fromEntries(
      Object.entries(exposed).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
    ),
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'apps/web/src') } },
    plugins: [react(), tailwindcss()],
    server: {
      // dev: ส่ง /api ต่อไปที่ Elysia (bun run dev:api)
      proxy: { '/api': 'http://localhost:3000' },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
