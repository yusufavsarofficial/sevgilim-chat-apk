import { Pool, QueryResultRow } from "pg";
import { config } from "./config.js";

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: {
    rejectUnauthorized: config.PG_SSL_REJECT_UNAUTHORIZED
  },
  max: 10,
  idleTimeoutMillis: 30000
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function ensureDatabaseSchema(): Promise<void> {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS register_ip TEXT,
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS login_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS device_brand TEXT,
      ADD COLUMN IF NOT EXISTS device_model TEXT,
      ADD COLUMN IF NOT EXISTS os_name TEXT,
      ADD COLUMN IF NOT EXISTS os_version TEXT,
      ADD COLUMN IF NOT EXISTS app_version TEXT,
      ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ban_type TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      ip_address TEXT,
      device_info TEXT,
      success BOOLEAN NOT NULL DEFAULT FALSE,
      fail_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS user_admin_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS user_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_fingerprint TEXT NOT NULL,
      device_info TEXT,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_ip TEXT,
      UNIQUE (user_id, device_fingerprint)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value_json JSONB NOT NULL DEFAULT '{}'::JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS app_announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON login_attempts(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id)`);
}
