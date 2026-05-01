import { Router } from "express";
import { z } from "zod";
import { createAuditLog } from "../utils/audit.js";

const signalSchema = z.object({
  emulator: z.boolean().optional(),
  rooted: z.boolean().optional(),
  debug: z.boolean().optional(),
  developerMode: z.boolean().optional(),
  details: z.string().max(500).optional()
});

export const securityRouter = Router();

securityRouter.post("/device-signal", async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: "Yetkisiz." });
    return;
  }

  const parsed = signalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz güvenlik sinyali." });
    return;
  }

  await createAuditLog({
    adminUserId: null,
    action: "DEVICE_SECURITY_SIGNAL",
    targetUserId: req.auth.userId,
    ipAddress: req.clientIpAddress,
    details: {
      ...parsed.data,
      deviceInfo: req.clientDeviceInfo
    }
  });

  res.json({ success: true });
});