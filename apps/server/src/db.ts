import postgres from 'postgres'

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set — copy .env.example to .env at the project root')
}

// Supabase transaction pooler (port 6543) ไม่รองรับ prepared statements
export const sql = postgres(process.env.DATABASE_URL ?? '', { prepare: false })
