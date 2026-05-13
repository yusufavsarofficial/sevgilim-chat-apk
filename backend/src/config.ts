import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(12),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("30d"),
  ADMIN_USERNAME: z.string().min(3),
  ADMIN_PASSWORD_HASH: z.string().startsWith("$2").min(50),
  REGISTER_INVITE_KEY_HASH: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  PG_SSL_REJECT_UNAUTHORIZED: z.preprocess(
    (value) => {
      if (typeof value === "string") {
        const lowered = value.trim().toLowerCase();
        if (lowered === "false" || lowered === "0") return false;
        if (lowered === "true" || lowered === "1") return true;
      }
      return value;
    },
    z.boolean().default(true)
  ),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default("http://localhost:8081,http://localhost:19006"),
  API_BASE_URL: z.string().optional(),
  UPLOADS_DIR: z.string().optional()
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

