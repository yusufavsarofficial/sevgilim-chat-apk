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