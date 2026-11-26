import { Elysia } from 'elysia'
import { opentelemetry } from '@elysia/opentelemetry'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import { openapi } from '@elysiajs/openapi'
import { authRoutes } from './routes/auth'
import { featuresRoutes } from './routes/features'
import { groupRoutes } from './routes/groups'
import { layerPrefRoutes } from './routes/layerPrefs'
import { layerRoutes } from './routes/layers'
import { notificationRoutes } from './routes/notifications'
import { recordRoutes } from './routes/records'

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
  // trace + metric: 1 trace ต่อ request (เปลี่ยน my-service เป็นชื่อแอปคุณ)
  .use(opentelemetry({ serviceName: 'my-service' }))
  // log: 1 บรรทัดต่อ request
  .onAfterResponse({ as: 'global' }, ({ request, set }) => {
    const status = typeof set.status === 'number' ? set.status : 200
    const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO'
    logs.getLogger('my-service').emit({
      severityText: level,
      severityNumber: SeverityNumber[level],
      body: `${request.method} ${new URL(request.url).pathname} ${status}`,
      attributes: { 'http.request.method': request.method, 'http.response.status_code': status }
    })
  })
  .use(docs)
  .get('/health', () => ({ status: 'ok' }))
  .use(authRoutes)
  .use(featuresRoutes)
  .use(layerRoutes)
  .use(layerPrefRoutes)
  .use(recordRoutes)
  .use(groupRoutes)
  .use(notificationRoutes)
