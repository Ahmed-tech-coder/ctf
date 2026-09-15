import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from workspace root or server directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Automatically append ?pgbouncer=true if using pooler connection (port 6543 or pooler host) to avoid Prepared Statement errors
if (
  process.env.DATABASE_URL &&
  (process.env.DATABASE_URL.includes(':6543') || process.env.DATABASE_URL.includes('-pooler')) &&
  !process.env.DATABASE_URL.includes('pgbouncer=true')
) {
  process.env.DATABASE_URL += process.env.DATABASE_URL.includes('?')
    ? '&pgbouncer=true'
    : '?pgbouncer=true';
}

const envSchema = z.object({
  PORT: z.string().default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/ctf_platform?schema=public'),
  DIRECT_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional().default('https://your-project.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default('your-supabase-service-role-key'),
  SUPABASE_STORAGE_BUCKET: z.string().default('challenge-files'),
  JWT_SECRET: z.string().default('super-secret-jwt-key-change-this-in-production-ctf-2026'),
  ADMIN_JWT_SECRET: z.string().default('super-secret-admin-jwt-key-change-this-in-production-ctf-2026'),
  FLAG_SALT: z.string().default('ctf-platform-flag-salt-2026'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    return envSchema.parse({}); // fallback to defaults
  }
  return result.data;
};

export const env = parseEnv();

