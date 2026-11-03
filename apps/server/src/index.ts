import { Elysia } from 'elysia'
import { openapi } from '@elysiajs/openapi'
import { featuresRoutes } from './routes/features'

// หน้า docs (/api/openapi) เปิดเฉพาะตอน dev — บน Vercel (NODE_ENV=production) ปิดไว้
// ถ้าต้องการเปิดชั่วคราว (เช่น ตอนนำเสนอ) ตั้ง ENABLE_DOCS=true
export const docsEnabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DOCS === 'true'

const docs = docsEnabled
  ? openapi({
      documentation: {
        info: { title: 'Web Mapping API', version: '1.0.0', description: 'CRUD ข้อมูลเชิงพื้นที่ในรูปแบบ GeoJSON' }
      }
    })
  : new Elysia()

export const app = new Elysia({ prefix: '/api' })
  .use(docs)
  .get('/health', () => ({ status: 'ok' }))
  .use(featuresRoutes)
