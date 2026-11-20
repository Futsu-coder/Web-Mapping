import { Elysia } from 'elysia'
import { opentelemetry } from '@elysia/opentelemetry'
import { context, metrics, trace, SpanKind, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api'
import { logs, SeverityNumber, type Logger } from '@opentelemetry/api-logs'

// ส่ง traces + logs + metrics ไป Telemetry Collection Service ผ่าน OpenTelemetry (OTLP)
// เปิดเฉพาะตอนตั้ง OTEL_EXPORTER_OTLP_ENDPOINT ไว้ใน .env — ไม่ได้ตั้ง/Vercel ไม่มีผล
//   traces  : plugin สร้างให้ 1 span ต่อ request
//   metrics : plugin สร้าง http.server.request.duration ให้ + ไฟล์นี้เพิ่ม process.memory.usage
//             (SDK เวอร์ชันนี้ต้องตั้ง OTEL_METRICS_EXPORTER=otlp ด้วย ไม่งั้นไม่ส่ง metrics)
//   logs    : ไฟล์นี้จด access log 1 บรรทัดต่อ request (ผูกกับ trace อัตโนมัติ)
const enabled = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'web-mapping-api'

// bun --hot (dev) โหลดไฟล์นี้ใหม่ทุกครั้งที่แก้โค้ด แต่ globalThis ไม่ถูกล้าง
// ของที่ต้องมีครั้งเดียวต่อ process จึงจำไว้ใน globalThis ไม่งั้นจะส่ง metric ซ้ำเพิ่มทุกครั้งที่ reload
// (ตัว SDK เองไม่ซ้ำ: plugin start SDK เฉพาะตอนยังไม่มี tracer provider ระดับ global)
const once = globalThis as { __webMappingMemoryGauge?: true }

// ขอ logger/meter ตอนใช้ครั้งแรก เพราะ SDK เริ่มทำงานตอน opentelemetry() ข้างล่างถูกเรียก
let logger: Logger | undefined
function getLogger() {
  if (!logger) {
    logger = logs.getLogger(serviceName)
    if (!once.__webMappingMemoryGauge) {
      once.__webMappingMemoryGauge = true
      metrics
        .getMeter(serviceName)
        .createObservableUpDownCounter('process.memory.usage', { unit: 'By', description: 'The amount of physical memory in use.' })
        .addCallback((result) => result.observe(process.memoryUsage().rss))
    }
  }
  return logger
}

// ส่ง traces/logs/metrics ที่ยังค้างใน buffer ของ SDK ออกไปให้หมด ใช้ตอนปิด server (server.ts)
// ไม่งั้นข้อมูลไม่กี่วินาทีสุดท้ายก่อนปิดจะหาย / รอไม่เกิน timeoutMs เผื่อ collector ล่ม จะได้ไม่ค้าง
type Flushable = { forceFlush?: () => Promise<unknown>; getDelegate?: () => unknown }
export async function flushTelemetry(timeoutMs = 5000) {
  if (!enabled) return
  const providers = [trace.getTracerProvider(), logs.getLoggerProvider(), metrics.getMeterProvider()] as Flushable[]
  const work = Promise.allSettled(
    providers.map((p) => ((p.getDelegate?.() ?? p) as Flushable).forceFlush?.())
  )
  await Promise.race([work, Bun.sleep(timeoutMs)])
}

// ครอบงานที่อาจช้า (เช่นคุยกับ Supabase / Postgres) เป็น span ลูกของ request -> ดูใน trace ได้ว่าช้าที่ขั้นไหน
// ไม่ได้เปิด telemetry = tracer ว่าง (no-op) ไม่มีผลอะไร
// ต้องขอ tracer ตอนเรียก ไม่ใช่ตอนโหลดไฟล์: ถ้าขอก่อน SDK เริ่ม (opentelemetry() ข้างล่าง) จะได้ tracer ว่างค้างไว้ตลอด
// span ที่ยังไม่จบ แยกตาม trace_id -> ถ้า request ถูกตัดกลางทาง (accessLog ข้างล่าง) จะปิด span ที่ค้างเป็น error
// ไม่งั้น span ที่ค้าง (เช่นรอ Supabase) จะไม่ถูกส่งเลย ดู trace แล้วไม่รู้ว่าค้างที่ขั้นไหน
const openSpans = new Map<string, Set<Span>>()

export function traced<T>(name: string, opts: { kind?: SpanKind; attributes?: Attributes }, fn: () => Promise<T>): Promise<T> {
  return trace.getTracer(serviceName).startActiveSpan(name, opts, async (span) => {
    const traceId = span.spanContext().traceId
    const open = openSpans.get(traceId) ?? new Set<Span>()
    openSpans.set(traceId, open.add(span))
    try {
      return await fn()
    } catch (e) {
      if (e instanceof Error) span.recordException(e)
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw e
    } finally {
      open.delete(span)
      if (open.size === 0) openSpans.delete(traceId)
      if (span.isRecording()) span.end() // ถูกปิดไปแล้วตอน request ถูกตัด -> ไม่ end ซ้ำ
    }
  })
}

// request ถูกตัดก่อนตอบ: ปิด span ลูกที่ยังค้างของ trace นั้นเป็น error
function abortOpenSpans(traceId: string) {
  for (const span of openSpans.get(traceId) ?? []) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'Request aborted before this step finished' })
    span.end()
  }
  openSpans.delete(traceId)
}

// ขนาด body ที่ส่งกลับ (byte) สำหรับ semconv http.response.body.size — ใช้คิดบิลตามขนาด response
// รู้ไม่ได้ (stream, error ที่ Elysia แปลงเอง, Response ไม่มี content-length) -> undefined = ไม่ใส่ field
// ห้ามเดาเป็น 0 ฝั่งระบบเก็บ log จะได้นับได้ว่ามีกี่ request ที่ไม่รู้ขนาด
function bodySize(value: unknown, status: number): number | undefined {
  // ไม่มีค่าที่คืนมา: 204/304 ไม่มี body ตามมาตรฐาน HTTP = 0 จริง / อย่างอื่น (เช่น error) Elysia สร้าง body เอง -> ไม่รู้
  if (value === undefined || value === null) return status === 204 || status === 304 ? 0 : undefined
  if (typeof value === 'string') return Buffer.byteLength(value)
  if (typeof value === 'number' || typeof value === 'boolean') return Buffer.byteLength(String(value))
  if (value instanceof Response) {
    const len = value.headers.get('content-length')
    return len === null ? undefined : Number(len)
  }
  if (value instanceof Blob) return value.size
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value.byteLength
  if (value instanceof Error || value instanceof ReadableStream || typeof value === 'function') return undefined
  if (typeof value === 'object' && Symbol.asyncIterator in value) return undefined
  try {
    return Buffer.byteLength(JSON.stringify(value)) // object/array Elysia ส่งเป็น JSON
  } catch {
    return undefined
  }
}

const started = new WeakMap<Request, number>()
const failures = new WeakMap<Request, unknown>()
const finished = new WeakSet<Request>() // จด log ของ request นี้ไปแล้ว (ตอบปกติ หรือถูกตัด) -> ไม่จดซ้ำ

// request ถูกตัดก่อนตอบ (client ปิดเอง หรือเงียบเกิน idleTimeout 30 วิของ Elysia แล้ว Bun ตัด)
// ไม่มี response -> onAfterResponse ไม่ทำงาน -> เดิมไม่มี log เลย เห็นแค่ใน trace
// จด log ด้วย status 499 ตามแบบ NGINX ("client closed request") ไม่ใช่ status ที่ส่งจริง เพราะไม่ได้ส่งอะไรกลับไป
function logAborted(request: Request, root: Span | undefined) {
  if (finished.has(request)) return
  finished.add(request)
  if (root) abortOpenSpans(root.spanContext().traceId)
  const ms = performance.now() - (started.get(request) ?? performance.now())
  const path = new URL(request.url).pathname
  getLogger().emit({
    // ตอน abort ไม่มี context ของ request แล้ว -> ผูก log กับ trace เองจาก root span
    ...(root && { context: trace.setSpan(context.active(), root) }),
    severityNumber: SeverityNumber.WARN,
    severityText: 'WARN',
    body: `${request.method} ${path} 499 ${ms.toFixed(1)}ms (ถูกตัดก่อนตอบ)`,
    attributes: {
      'http.request.method': request.method,
      'http.response.status_code': 499,
      'url.path': path,
      // semconv: request พังก่อนได้ status จริง -> error.type เป็นรหัสสั้น ๆ บอกสาเหตุ
      'error.type': 'request_aborted'
    }
  })
}

const accessLog = new Elysia({ name: 'access-log' })
  .onRequest(({ request }) => {
    started.set(request, performance.now())
    // root span ของ request นี้ (plugin สร้างไว้ก่อนแล้ว) ใช้ผูก log กับ trace และหา span ลูกที่ค้างตอนถูกตัด
    const root = trace.getActiveSpan()
    request.signal.addEventListener('abort', () => logAborted(request, root), { once: true })
  })
  .onError({ as: 'global' }, ({ request, error }) => {
    failures.set(request, error)
  })
  .onAfterResponse({ as: 'global' }, ({ request, route, set, ...ctx }) => {
    if (finished.has(request)) return // ถูกตัดไปแล้ว จด 499 ไปแล้ว
    finished.add(request)
    const ms = performance.now() - (started.get(request) ?? performance.now())
    const status = typeof set.status === 'number' ? set.status : 200
    const path = new URL(request.url).pathname
    const failure = failures.get(request)
    // route ที่ผ่าน auth (auth.ts) จะมี user -> รู้ว่าใครเรียก / route ที่ไม่ต้อง login ไม่มี
    const user = (ctx as { user?: { id: string; username: string } }).user
    const size = bodySize((ctx as { responseValue?: unknown }).responseValue, status)

    getLogger().emit({
      severityNumber: status >= 500 ? SeverityNumber.ERROR : status >= 400 ? SeverityNumber.WARN : SeverityNumber.INFO,
      severityText: status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO',
      body: `${request.method} ${path} ${status} ${ms.toFixed(1)}ms`,
      attributes: {
        'http.request.method': request.method,
        ...(route && { 'http.route': route }), // ไม่มี route ที่ตรง (เช่น 404) ก็ไม่ใส่ ตาม semconv
        'http.response.status_code': status,
        ...(size !== undefined && { 'http.response.body.size': size }),
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
