import { Elysia, ElysiaCustomStatusResponse } from 'elysia'
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

// เวลาที่ request เข้าถึง backend (ใช้เป็น Timestamp ของ log) เก็บต่อ request แล้วหายเองเมื่อ request ถูกทิ้ง
const startedAt = new WeakMap<Request, number>()

export const app = new Elysia({ prefix: '/api' })
  // trace + metric: 1 trace ต่อ request (เปลี่ยน my-service เป็นชื่อแอปคุณ)
  .use(
    opentelemetry({
      serviceName: 'my-service',
      // เก็บ body + header ที่ปลอดภัย (ห้ามใส่ authorization / cookie) ระบบกลางจะปิดค่าลับ + ย่อพิกัดให้อีกชั้น
      recordBody: true,
      headersToSpanAttributes: {
        request: ['content-type', 'content-length', 'user-agent', 'referer', 'origin', 'x-request-id', 'idempotency-key'],
        response: ['content-type', 'content-length', 'location']
      }
    })
  )
  // plugin อ่านรหัสจาก throw status(401, ...) ไม่ได้ จึงบันทึก span เป็น 500 ผิด บรรทัดนี้ตั้ง status ให้ถูก
  .onError({ as: 'global' }, ({ error, set }) => {
    if (error instanceof ElysiaCustomStatusResponse) set.status = error.code
  })
  // จดเวลาที่ request เข้ามา (ละเอียดถึงเศษ ms)
  .onRequest(({ request }) => {
    startedAt.set(request, performance.timeOrigin + performance.now())
  })
  // log: 1 บรรทัดต่อ request
  .onAfterResponse({ as: 'global' }, ({ request, set, server, responseValue }) => {
    const status = typeof set.status === 'number' ? set.status : 200
    const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO'
    const url = new URL(request.url)
    // plugin ไม่ส่ง path / IP / server / response body มาให้ จึงเติมเอง (ระบบกลางปิดค่าลับ + ย่อพิกัดให้)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || server?.requestIP(request)?.address
    const raw = responseValue instanceof ElysiaCustomStatusResponse ? responseValue.response : responseValue
    const text =
      raw === undefined || raw === null || raw instanceof Response || raw instanceof Blob || raw instanceof ReadableStream
        ? undefined
        : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
    logs.getLogger('my-service').emit({
      timestamp: startedAt.get(request) ?? Date.now(), // Timestamp = เวลาที่ backend รับ request (ObservedTimestamp = ตอนเขียน log นี้ SDK ใส่ให้เอง)
      severityText: level,
      severityNumber: SeverityNumber[level],
      body: `${request.method} ${url.pathname} ${status}`,
      attributes: {
        'http.request.method': request.method,
        'http.response.status_code': status,
        'url.path': url.pathname,
        ...(url.search && { 'url.query': url.search.slice(1) }),
        'server.address': url.hostname,
        ...(url.port && { 'server.port': Number(url.port) }),
        ...(ip && { 'client.address': ip }),
        // ขนาดเป็นไบต์ (ตามมาตรฐาน OTel) · GET ที่สำเร็จเก็บแค่ขนาด (ข้อมูลเป็นก้อนใหญ่) ส่วน request อื่นและ GET ที่ error (>= 400) เก็บเนื้อหาด้วย
        ...(text !== undefined && { 'http.response.body.size': Buffer.byteLength(text) }),
        ...(text !== undefined && (request.method !== 'GET' || status >= 400) && { 'http.response.body': text })
      }
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
