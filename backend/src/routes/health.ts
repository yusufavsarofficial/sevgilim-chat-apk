import { Router } from "express";
import { query } from "../db.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, service: "puantaj-maas-backend" });
  } catch {
    res.status(500).json({ ok: false });
  }
});

healthRouter.get("/app-update", async (_req, res) => {
  const rows = await query<{ value_json: unknown; updated_at: string }>(
    `SELECT value_json, updated_at FROM admin_settings WHERE key = 'app_update' LIMIT 1`
  );
  res.json({
    update: rows[0]?.value_json ?? {
      version: "",
      message: "",
      apkUrl: "",
      required: false,
      updatedAt: null
    },
    updatedAt: rows[0]?.updated_at ?? null
  });
});
