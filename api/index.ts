// Vercel Function entry — ทุก request /api/* ถูก rewrite มาที่นี่ (ดู vercel.json)
import { app } from '../apps/server/src/index'

export const GET = app.fetch
export const POST = app.fetch
export const PUT = app.fetch
export const PATCH = app.fetch
export const DELETE = app.fetch
export const OPTIONS = app.fetch
