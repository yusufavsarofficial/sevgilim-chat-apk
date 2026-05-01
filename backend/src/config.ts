import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(12),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("30d"),
  ADMIN_USERNAME: z.string().min(3).default("Ayf"),
  ADMIN_PASSWORD_HASH: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .default("3bbe665633d6edfd61e91598560db3fee78a21da78b3fe77e9fefac5ecfc4cc1"),
  REGISTER_INVITE_KEY_HASH: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .default("3825b97592ef25f0bb0fb784a3bfe0b016b1e27e134cff2379b69f85842cf52f"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default("*"),
  API_BASE_URL: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((item) => `${item.path.join(".")}: ${item.message}`).join("; ");
  throw new Error(`Geçersiz ortam değişkenleri: ${details}`);
}

const corsOrigins = parsed.data.CORS_ORIGIN.split(",")
  .map((item) => item.trim())
  .filter(Boolean);

export const config = {
  ...parsed.data,
  corsOrigins
};

