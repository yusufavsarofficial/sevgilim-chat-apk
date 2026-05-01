import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(12),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("30d"),
  ADMIN_USERNAME: z.string().min(3).default("Yusuf"),
  ADMIN_PASSWORD: z.string().min(8).default("Yusuf123"),
  REGISTER_INVITE_KEY: z.string().min(6).default("2026Yusuf"),
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

