import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set — copy .env.example to .env at the project root')
}

// Supabase transaction pooler (port 6543) ไม่รองรับ prepared statements
const client = postgres(process.env.DATABASE_URL ?? '', { prepare: false })

export const db = drizzle(client, { schema })
