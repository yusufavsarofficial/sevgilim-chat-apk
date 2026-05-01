import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureAdminUser } from "./bootstrap.js";
import { config } from "./config.js";
import { requireAdmin, requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { requestMetaMiddleware } from "./middleware/requestMeta.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { payrollRouter } from "./routes/payroll.js";
import { securityRouter } from "./routes/security.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 250,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin." }
});

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}));

const allowedOrigins = config.corsOrigins;
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS engeli"));
    }
  })
);

app.use(limiter);
app.use(express.json({ limit: "300kb" }));
app.use(express.urlencoded({ extended: false, limit: "300kb" }));
app.use(requestMetaMiddleware);
app.use("/api", (_req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/payroll", requireAuth, payrollRouter);
app.use("/api/security", requireAuth, securityRouter);
app.use("/api/admin", requireAuth, requireAdmin, adminRouter);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminPanelDir = path.resolve(__dirname, "../../admin-panel");

app.use("/admin", express.static(adminPanelDir));
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(adminPanelDir, "index.html"));
});

app.use(notFoundHandler);
app.use(errorHandler);

async function start(): Promise<void> {
  await ensureAdminUser();
  app.listen(config.PORT, () => {
    process.stdout.write(`Backend hazır: http://localhost:${config.PORT}\n`);
  });
}

start().catch((error) => {
  process.stderr.write(`Backend başlatılamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}\n`);
  process.exit(1);
});
