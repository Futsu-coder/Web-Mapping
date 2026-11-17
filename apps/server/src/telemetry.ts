import { Elysia } from 'elysia'
import { opentelemetry } from '@elysia/opentelemetry'
import { metrics } from '@opentelemetry/api'
import { logs, SeverityNumber, type Logger } from '@opentelemetry/api-logs'

// ส่ง traces + logs + metrics ไป Telemetry Collection Service ผ่าน OpenTelemetry (OTLP)
// เปิดเฉพาะตอนตั้ง OTEL_EXPORTER_OTLP_ENDPOINT ไว้ใน .env — ไม่ได้ตั้ง/Vercel ไม่มีผล
//   traces  : plugin สร้างให้ 1 span ต่อ request
//   metrics : plugin สร้าง http.server.request.duration ให้ + ไฟล์นี้เพิ่ม process.memory.usage
//             (SDK เวอร์ชันนี้ต้องตั้ง OTEL_METRICS_EXPORTER=otlp ด้วย ไม่งั้นไม่ส่ง metrics)
//   logs    : ไฟล์นี้จด access log 1 บรรทัดต่อ request (ผูกกับ trace อัตโนมัติ)
const enabled = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'web-mapping-api'

// ขอ logger/meter ตอนใช้ครั้งแรก เพราะ SDK เริ่มทำงานตอน opentelemetry() ข้างล่างถูกเรียก
let logger: Logger | undefined
function getLogger() {
  if (!logger) {
    logger = logs.getLogger(serviceName)
    metrics
      .getMeter(serviceName)
      .createObservableUpDownCounter('process.memory.usage', { unit: 'By', description: 'The amount of physical memory in use.' })
      .addCallback((result) => result.observe(process.memoryUsage().rss))
  }
  return logger
}

const started = new WeakMap<Request, number>()
const failures = new WeakMap<Request, unknown>()

const accessLog = new Elysia({ name: 'access-log' })
  .onRequest(({ request }) => {
    started.set(request, performance.now())
  })
  .onError({ as: 'global' }, ({ request, error }) => {
    failures.set(request, error)
  })
  .onAfterResponse({ as: 'global' }, ({ request, route, set, ...ctx }) => {
    const ms = performance.now() - (started.get(request) ?? performance.now())
    const status = typeof set.status === 'number' ? set.status : 200
    const path = new URL(request.url).pathname
    const failure = failures.get(request)
    // route ที่ผ่าน auth (auth.ts) จะมี user -> รู้ว่าใครเรียก / route ที่ไม่ต้อง login ไม่มี
    const user = (ctx as { user?: { id: string; username: string } }).user

    getLogger().emit({
      severityNumber: status >= 500 ? SeverityNumber.ERROR : status >= 400 ? SeverityNumber.WARN : SeverityNumber.INFO,
      severityText: status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO',
      body: `${request.method} ${path} ${status} ${ms.toFixed(1)}ms`,
      attributes: {
        'http.request.method': request.method,
        ...(route && { 'http.route': route }), // ไม่มี route ที่ตรง (เช่น 404) ก็ไม่ใส่ ตาม semconv
        'http.response.status_code': status,
        'url.path': path,
        // semconv user.*: ใครเป็นคนเรียก (Error Tracking นับได้ว่ากี่คนเจอ)
        ...(user && { 'user.id': user.id, 'user.name': user.username }),
        // semconv: ฝั่ง server นับเป็น error เฉพาะ 5xx
        ...(status >= 500 && { 'error.type': String(status) }),
        // semconv exceptions: type + message + stacktrace (stacktrace บอกว่าพังที่ไฟล์/บรรทัดไหน)
        ...(status >= 500 &&
          failure instanceof Error && {
            'exception.type': failure.name,
            'exception.message': failure.message,
            ...(failure.stack && { 'exception.stacktrace': failure.stack })
          })
      }
    })
  })

// route ทดสอบ: GET /api/debug/error พังทุกครั้ง ไว้ลอง Error Tracking ของ Telemetry Collection Service
// มีเฉพาะตอนเปิด telemetry (ตั้ง OTEL_EXPORTER_OTLP_ENDPOINT) — รันปกติ/Vercel ไม่มี route นี้
function simulateFailure(): never {
  throw new Error('debug: จำลอง error สำหรับทดสอบ Error Tracking')
}
const debugRoutes = new Elysia({ name: 'telemetry-debug' }).get('/debug/error', () => simulateFailure())

export const telemetry = enabled
  ? new Elysia({ name: 'telemetry' }).use(opentelemetry({ serviceName })).use(accessLog).use(debugRoutes)
  : new Elysia()
