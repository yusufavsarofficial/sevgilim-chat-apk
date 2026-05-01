import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { createAuditLog } from "../utils/audit.js";
import { normalizeUsername } from "../utils/security.js";

const userIdParamSchema = z.object({ id: z.string().uuid() });
const banSchema = z.object({ reason: z.string().min(1).max(500) });
const ipBanSchema = z.object({ ipAddress: z.string().min(3).max(120), reason: z.string().max(500).optional() });
const createUserSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(6).max(120),
  role: z.enum(["USER", "ADMIN"]).default("USER")
});
const updateUserSchema = z.object({
  username: z.string().min(3).max(40).optional(),
  password: z.string().min(6).max(120).optional(),
  role: z.enum(["USER", "ADMIN"]).optional()
});

function toUserDetail(row: {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
  is_banned: boolean;
  is_active: boolean;
  ban_reason: string | null;
  created_at: string;
  last_login_at: string | null;
  last_ip: string | null;
  device_info: string | null;
}) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    isBanned: row.is_banned,
    isActive: row.is_active,
    banReason: row.ban_reason,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    lastIp: row.last_ip,
    deviceInfo: row.device_info
  };
}

export const adminRouter = Router();

adminRouter.get("/stats", async (_req, res) => {
  const counts = await query<{
    total_users: string;
    active_users: string;
    banned_users: string;
  }>(
    `
      SELECT
        COUNT(*)::text AS total_users,
        COUNT(*) FILTER (WHERE is_active = TRUE)::text AS active_users,
        COUNT(*) FILTER (WHERE is_banned = TRUE)::text AS banned_users
      FROM users
      WHERE role = 'USER'
    `
  );

  const recentLogins = await query<{
    id: string;
    username: string;
    last_login_at: string | null;
    last_ip: string | null;
  }>(
    `
      SELECT id, username, last_login_at, last_ip
      FROM users
      WHERE role = 'USER'
      ORDER BY last_login_at DESC NULLS LAST
      LIMIT 10
    `
  );

  const stats = counts[0];
  res.json({
    totalUsers: Number(stats.total_users),
    activeUsers: Number(stats.active_users),
    bannedUsers: Number(stats.banned_users),
    recentLogins: recentLogins.map((item) => ({
      id: item.id,
      username: item.username,
      lastLoginAt: item.last_login_at,
      lastIp: item.last_ip
    }))
  });
});

adminRouter.get("/users", async (req, res) => {
  const search = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const rows = await query<{
    id: string;
    username: string;
    role: "ADMIN" | "USER";
    is_banned: boolean;
    is_active: boolean;
    ban_reason: string | null;
    created_at: string;
    last_login_at: string | null;
    last_ip: string | null;
    device_info: string | null;
  }>(
    search
      ? `
          SELECT id, username, role, is_banned, is_active, ban_reason, created_at, last_login_at, last_ip, device_info
          FROM users
          WHERE username LIKE $1
          ORDER BY created_at DESC
          LIMIT 300
        `
      : `
          SELECT id, username, role, is_banned, is_active, ban_reason, created_at, last_login_at, last_ip, device_info
          FROM users
          ORDER BY created_at DESC
          LIMIT 300
        `,
    search ? [`%${search}%`] : []
  );

  res.json({ users: rows.map(toUserDetail) });
});

adminRouter.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Kullanıcı bilgileri geçersiz." });
    return;
  }

  const username = normalizeUsername(parsed.data.username);
  const existing = await query<{ id: string }>(`SELECT id FROM users WHERE username = $1 LIMIT 1`, [username]);
  if (existing.length > 0) {
    res.status(409).json({ error: "Bu kullanıcı adı zaten kayıtlı." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const inserted = await query<{ id: string }>(
    `
      INSERT INTO users (username, password_hash, role, is_active, is_banned)
      VALUES ($1, $2, $3, TRUE, FALSE)
      RETURNING id
    `,
    [username, passwordHash, parsed.data.role]
  );

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "USER_CREATE",
    targetUserId: inserted[0]?.id ?? null,
    ipAddress: req.clientIpAddress,
    details: { username, role: parsed.data.role }
  });

  res.status(201).json({ success: true });
});

adminRouter.patch("/users/:id", async (req, res) => {
  const idParsed = userIdParamSchema.safeParse(req.params);
  const bodyParsed = updateUserSchema.safeParse(req.body);
  if (!idParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Güncelleme bilgileri geçersiz." });
    return;
  }

  const userId = idParsed.data.id;
  const payload = bodyParsed.data;

  const currentRows = await query<{ id: string; role: "ADMIN" | "USER" }>(`SELECT id, role FROM users WHERE id = $1 LIMIT 1`, [
    userId
  ]);

  if (currentRows.length === 0) {
    res.status(404).json({ error: "Kullanıcı bulunamadı." });
    return;
  }

  if (payload.username) {
    const normalized = normalizeUsername(payload.username);
    const duplicate = await query<{ id: string }>(
      `SELECT id FROM users WHERE username = $1 AND id <> $2 LIMIT 1`,
      [normalized, userId]
    );
    if (duplicate.length > 0) {
      res.status(409).json({ error: "Bu kullanıcı adı zaten kullanımda." });
      return;
    }
    await query(`UPDATE users SET username = $2 WHERE id = $1`, [userId, normalized]);
  }

  if (payload.password) {
    const passwordHash = await bcrypt.hash(payload.password, 12);
    await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
  }

  if (payload.role) {
    if (req.auth?.userId === userId && payload.role !== "ADMIN") {
      res.status(400).json({ error: "Kendi yönetici yetkinizi kaldıramazsınız." });
      return;
    }
    await query(`UPDATE users SET role = $2 WHERE id = $1`, [userId, payload.role]);
  }

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "USER_UPDATE",
    targetUserId: userId,
    ipAddress: req.clientIpAddress,
    details: payload
  });

  res.json({ success: true });
});

adminRouter.delete("/users/:id", async (req, res) => {
  const parsed = userIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz kullanıcı kimliği." });
    return;
  }

  if (req.auth?.userId === parsed.data.id) {
    res.status(400).json({ error: "Kendi hesabınızı silemezsiniz." });
    return;
  }

  const target = await query<{ id: string; role: "ADMIN" | "USER" }>(`SELECT id, role FROM users WHERE id = $1 LIMIT 1`, [
    parsed.data.id
  ]);
  if (target.length === 0) {
    res.status(404).json({ error: "Kullanıcı bulunamadı." });
    return;
  }

  await query(`DELETE FROM users WHERE id = $1`, [parsed.data.id]);

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "USER_DELETE",
    targetUserId: parsed.data.id,
    ipAddress: req.clientIpAddress,
    details: { role: target[0].role }
  });

  res.json({ success: true });
});

adminRouter.get("/users/:id", async (req, res) => {
  const parsed = userIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz kullanıcı kimliği." });
    return;
  }

  const userRows = await query<{
    id: string;
    username: string;
    role: "ADMIN" | "USER";
    is_banned: boolean;
    is_active: boolean;
    ban_reason: string | null;
    created_at: string;
    last_login_at: string | null;
    last_ip: string | null;
    device_info: string | null;
  }>(
    `
      SELECT id, username, role, is_banned, is_active, ban_reason, created_at, last_login_at, last_ip, device_info
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [parsed.data.id]
  );

  if (userRows.length === 0) {
    res.status(404).json({ error: "Kullanıcı bulunamadı." });
    return;
  }

  const sessionRows = await query<{
    id: string;
    ip_address: string | null;
    device_info: string | null;
    created_at: string;
    expires_at: string;
    revoked_at: string | null;
  }>(
    `
      SELECT id, ip_address, device_info, created_at, expires_at, revoked_at
      FROM sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [parsed.data.id]
  );

  const payrollRows = await query<{ data_json: unknown; updated_at: string }>(
    `
      SELECT data_json, updated_at
      FROM payroll_data
      WHERE user_id = $1
      LIMIT 1
    `,
    [parsed.data.id]
  );

  res.json({
    user: toUserDetail(userRows[0]),
    sessions: sessionRows.map((item) => ({
      id: item.id,
      ipAddress: item.ip_address,
      deviceInfo: item.device_info,
      createdAt: item.created_at,
      expiresAt: item.expires_at,
      revokedAt: item.revoked_at
    })),
    payroll: payrollRows[0]
      ? {
          data: payrollRows[0].data_json,
          updatedAt: payrollRows[0].updated_at
        }
      : null
  });
});

adminRouter.post("/users/:id/ban", async (req, res) => {
  const idParsed = userIdParamSchema.safeParse(req.params);
  const bodyParsed = banSchema.safeParse(req.body);
  if (!idParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Geçersiz ban isteği." });
    return;
  }

  await query(
    `
      UPDATE users
      SET is_banned = TRUE,
          ban_reason = $2
      WHERE id = $1
    `,
    [idParsed.data.id, bodyParsed.data.reason]
  );
  await query(`UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [idParsed.data.id]);

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "USER_BAN",
    targetUserId: idParsed.data.id,
    ipAddress: req.clientIpAddress,
    details: { reason: bodyParsed.data.reason }
  });

  res.json({ success: true });
});

adminRouter.post("/users/:id/unban", async (req, res) => {
  const idParsed = userIdParamSchema.safeParse(req.params);
  if (!idParsed.success) {
    res.status(400).json({ error: "Geçersiz kullanıcı kimliği." });
    return;
  }

  await query(
    `
      UPDATE users
      SET is_banned = FALSE,
          ban_reason = NULL
      WHERE id = $1
    `,
    [idParsed.data.id]
  );

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "USER_UNBAN",
    targetUserId: idParsed.data.id,
    ipAddress: req.clientIpAddress
  });

  res.json({ success: true });
});

adminRouter.post("/users/:id/disable", async (req, res) => {
  const parsed = userIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz kullanıcı kimliği." });
    return;
  }

  await query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [parsed.data.id]);
  await query(`UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [parsed.data.id]);

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "USER_DISABLE",
    targetUserId: parsed.data.id,
    ipAddress: req.clientIpAddress
  });

  res.json({ success: true });
});

adminRouter.post("/users/:id/enable", async (req, res) => {
  const parsed = userIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz kullanıcı kimliği." });
    return;
  }

  await query(`UPDATE users SET is_active = TRUE WHERE id = $1`, [parsed.data.id]);

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "USER_ENABLE",
    targetUserId: parsed.data.id,
    ipAddress: req.clientIpAddress
  });

  res.json({ success: true });
});

adminRouter.delete("/users/:id/data", async (req, res) => {
  const parsed = userIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz kullanıcı kimliği." });
    return;
  }

  await query(`DELETE FROM payroll_data WHERE user_id = $1`, [parsed.data.id]);

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "USER_PAYROLL_DELETE",
    targetUserId: parsed.data.id,
    ipAddress: req.clientIpAddress
  });

  res.json({ success: true });
});

adminRouter.post("/users/:id/revoke-sessions", async (req, res) => {
  const parsed = userIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz kullanıcı kimliği." });
    return;
  }

  await query(`UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [parsed.data.id]);

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "USER_SESSIONS_REVOKE",
    targetUserId: parsed.data.id,
    ipAddress: req.clientIpAddress
  });

  res.json({ success: true });
});

adminRouter.get("/audit-logs", async (_req, res) => {
  const rows = await query<{
    id: string;
    admin_user_id: string | null;
    action: string;
    target_user_id: string | null;
    ip_address: string | null;
    created_at: string;
    details: unknown;
  }>(
    `
      SELECT id, admin_user_id, action, target_user_id, ip_address, created_at, details
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 300
    `
  );

  res.json({ logs: rows });
});

adminRouter.get("/ip-bans", async (_req, res) => {
  const rows = await query<{ id: string; ip_address: string; reason: string | null; created_at: string }>(
    `
      SELECT id, ip_address, reason, created_at
      FROM ip_bans
      ORDER BY created_at DESC
      LIMIT 200
    `
  );

  res.json({
    items: rows.map((item) => ({
      id: item.id,
      ipAddress: item.ip_address,
      reason: item.reason,
      createdAt: item.created_at
    }))
  });
});

adminRouter.post("/ip-bans", async (req, res) => {
  const parsed = ipBanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz IP ban isteği." });
    return;
  }

  const ipAddress = parsed.data.ipAddress.trim();
  await query(
    `
      INSERT INTO ip_bans (ip_address, reason, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (ip_address)
      DO UPDATE SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by
    `,
    [ipAddress, parsed.data.reason ?? null, req.auth?.userId ?? null]
  );

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "IP_BAN_ADD",
    ipAddress: req.clientIpAddress,
    details: { targetIp: ipAddress, reason: parsed.data.reason ?? null }
  });

  res.json({ success: true });
});

adminRouter.delete("/ip-bans/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "Geçersiz IP ban kimliği." });
    return;
  }

  await query(`DELETE FROM ip_bans WHERE id = $1`, [id]);

  await createAuditLog({
    adminUserId: req.auth?.userId ?? null,
    action: "IP_BAN_REMOVE",
    ipAddress: req.clientIpAddress,
    details: { banId: id }
  });

  res.json({ success: true });
});
