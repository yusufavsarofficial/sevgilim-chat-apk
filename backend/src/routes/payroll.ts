import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";

const payrollSchema = z.object({
  data: z.record(z.any())
});

export const payrollRouter = Router();

payrollRouter.get("/", async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: "Yetkisiz." });
    return;
  }

  const rows = await query<{ data_json: unknown; updated_at: string }>(
    `
      SELECT data_json, updated_at
      FROM payroll_data
      WHERE user_id = $1
      LIMIT 1
    `,
    [req.auth.userId]
  );

  if (rows.length === 0) {
    res.json({ data: null, updatedAt: null });
    return;
  }

  res.json({ data: rows[0].data_json, updatedAt: rows[0].updated_at });
});

payrollRouter.post("/", async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: "Yetkisiz." });
    return;
  }

  const parsed = payrollSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz puantaj verisi." });
    return;
  }

  await query(
    `
      INSERT INTO payroll_data (user_id, data_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = NOW()
    `,
    [req.auth.userId, JSON.stringify(parsed.data.data)]
  );

  res.json({ success: true, updatedAt: new Date().toISOString() });
});