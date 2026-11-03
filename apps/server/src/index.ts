import { Elysia } from 'elysia'
import { openapi } from '@elysiajs/openapi'
import { featuresRoutes } from './routes/features'

export const app = new Elysia({ prefix: '/api' })
  .use(
    openapi({
      documentation: {
        info: { title: 'Web Mapping API', version: '1.0.0', description: 'CRUD ข้อมูลเชิงพื้นที่ในรูปแบบ GeoJSON' }
      }
    })
  )
  .get('/health', () => ({ status: 'ok' }))
  .use(featuresRoutes)
