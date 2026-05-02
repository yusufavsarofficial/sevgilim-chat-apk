import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(12),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("30d"),
  ADMIN_USERNAME: z.string().min(3).default("Yusuf"),
  ADMIN_PASSWORD_HASH: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .default("c3451b6107562d64e47292af94e8dd0ee16f8dc425b1c49d51196631e2292551"),
  REGISTER_INVITE_KEY_HASH: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .default("0ac5c8a0408bb091b81da0f486a2a70b45b6bbe5924bd5f62facbac802503039"),
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

