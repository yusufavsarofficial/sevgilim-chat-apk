import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { createAuditLog } from "../utils/audit.js";
import { hashToken, normalizeUsername, parseDurationToMs } from "../utils/security.js";
import { signAccessToken, signRefreshToken, verifyJwt } from "../utils/tokens.js";

const consentSchema = z.object({
  kvkk: z.boolean(),
  acikRiza: z.boolean(),
  gizlilik: z.boolean(),
  cerez: z.boolean(),
  cihazVerisi: z.boolean(),
  kullanimSartlari: z.boolean(),
  yasalSorumluluk: z.boolean(),
  istegeBagliBildirim: z.boolean().optional()
});

const registerSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(6).max(120),
  inviteKey: z.string().min(1),
  consents: consentSchema
});

const loginSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(6).max(120)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(16)
});

type UserRow = {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
  password_hash: string;
  is_banned: boolean;
  is_active: boolean;
  ban_reason: string | null;
  banned_until: string | null;
};

const accessLifetimeMs = parseDurationToMs(config.JWT_EXPIRES_IN, 15 * 60 * 1000);
const refreshLifetimeMs = parseDurationToMs(config.REFRESH_TOKEN_EXPIRES_IN, 30 * 24 * 60 * 60 * 1000);

function responseUser(user: Pick<UserRow, "id" | "username" | "role">) {
  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
}

function hasRequiredConsents(consents: z.infer<typeof consentSchema>): boolean {
  return (
    consents.kvkk &&
    consents.acikRiza &&
    consents.gizlilik &&
    consents.cerez &&
    consents.cihazVerisi &&
    consents.kullanimSartlari &&
    consents.yasalSorumluluk
  );
}

function isBanActive(user: Pick<UserRow, "is_banned" | "banned_until">): boolean {
  if (!user.is_banned) {
    return false;
  }
  if (!user.banned_until) {
    return true;
  }
  return new Date(user.banned_until).getTime() > Date.now();
}

async function createSessionTokens(input: {
  userId: string;
  username: string;
  role: "ADMIN" | "USER";
  ipAddress: string;
  deviceInfo: string;
}) {
  const sessionId = crypto.randomUUID();
  const accessToken = signAccessToken({
    sub: input.userId,
    username: input.username,
    role: input.role,
    sessionId
  });
  const refreshToken = signRefreshToken({
    sub: input.userId,
    username: input.username,
    role: input.role,
    sessionId
  });

  const now = Date.now();
  const accessExpires = new Date(now + accessLifetimeMs).toISOString();
  const refreshExpires = new Date(now + refreshLifetimeMs).toISOString();

  await query(
    `
      INSERT INTO sessions (
        id,
        user_id,
        token_hash,
        refresh_token_hash,
        ip_address,
        device_info,
        expires_at,
        refresh_expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      sessionId,
      input.userId,
      hashToken(accessToken),
      hashToken(refreshToken),
      input.ipAddress,
      input.deviceInfo,
      accessExpires,
      refreshExpires
    ]
  );

  return {
    accessToken,
    refreshToken,
    expiresAt: accessExpires,
    refreshExpiresAt: refreshExpires,
    sessionId
  };
}

async function isIpBanned(ipAddress: string): Promise<boolean> {
  const banned = await query<{ id: string }>(`SELECT id FROM ip_bans WHERE ip_address = $1 LIMIT 1`, [ipAddress]);
  return banned.length > 0;
}

async function recordLoginAttempt(input: {
  username: string;
  userId: string | null;
  ipAddress: string;
  deviceInfo: string;
  success: boolean;
  failReason?: string;
}): Promise<void> {
  await query(
    `
      INSERT INTO login_attempts (username, user_id, ip_address, device_info, success, fail_reason)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [input.username, input.userId, input.ipAddress, input.deviceInfo, input.success, input.failReason ?? null]
  );
}

async function upsertUserDevice(userId: string, ipAddress: string, deviceInfo: string): Promise<void> {
  const fingerprint = hashToken(`${userId}|${deviceInfo}`);
  await query(
    `
      INSERT INTO user_devices (user_id, device_fingerprint, device_info, last_ip)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, device_fingerprint)
      DO UPDATE SET device_info = EXCLUDED.device_info, last_ip = EXCLUDED.last_ip, last_seen_at = NOW()
    `,
    [userId, fingerprint, deviceInfo, ipAddress]
  );
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Kayıt bilgileri geçersiz." });
    return;
  }

  const ipAddress = req.clientIpAddress ?? "unknown";
  const deviceInfo = req.clientDeviceInfo ?? "unknown";

  if (await isIpBanned(ipAddress)) {
    res.status(403).json({ error: "Bu cihaz için kayıt işlemi kısıtlandı." });
    return;
  }

  if (hashToken(parsed.data.inviteKey.trim()) !== config.REGISTER_INVITE_KEY_HASH.toLowerCase()) {
    res.status(403).json({ error: "Kayıt anahtarı geçersiz." });
    return;
  }

  if (!hasRequiredConsents(parsed.data.consents)) {
    res.status(400).json({ error: "Zorunlu onaylar tamamlanmadan kayıt yapılamaz." });
    return;
  }

  const username = normalizeUsername(parsed.data.username);
  const existing = await query<{ id: string }>(`SELECT id FROM users WHERE username = $1 LIMIT 1`, [username]);
  if (existing.length > 0) {
    res.status(409).json({ error: "Bu kullanıcı adı zaten kayıtlı." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const inserted = await query<{ id: string; username: string; role: "ADMIN" | "USER" }>(
    `
      INSERT INTO users (username, password_hash, role, is_active, is_banned)
      VALUES ($1, $2, 'USER', TRUE, FALSE)
      RETURNING id, username, role
    `,
    [username, passwordHash]
  );

  const user = inserted[0];
  const session = await createSessionTokens({
    userId: user.id,
    username: user.username,
    role: user.role,
    ipAddress,
    deviceInfo
  });

  await query(
    `
      UPDATE users
      SET register_ip = COALESCE(register_ip, $2),
          last_login_at = NOW(),
          last_seen_at = NOW(),
          login_count = login_count + 1,
          last_ip = $2,
          device_info = $3,
          updated_at = NOW()
      WHERE id = $1
    `,
    [user.id, ipAddress, deviceInfo]
  );
  await recordLoginAttempt({ username, userId: user.id, ipAddress, deviceInfo, success: true });
  await upsertUserDevice(user.id, ipAddress, deviceInfo);

  await createAuditLog({
    adminUserId: null,
    action: "CONSENT_ACCEPT",
    targetUserId: user.id,
    ipAddress,
    details: parsed.data.consents
  });

  res.status(201).json({
    user: responseUser(user),
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    refreshExpiresAt: session.refreshExpiresAt
  });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Giriş bilgileri geçersiz." });
    return;
  }

  const ipAddress = req.clientIpAddress ?? "unknown";
  const deviceInfo = req.clientDeviceInfo ?? "unknown";

  if (await isIpBanned(ipAddress)) {
    await recordLoginAttempt({
      username: normalizeUsername(parsed.data.username),
      userId: null,
      ipAddress,
      deviceInfo,
      success: false,
      failReason: "IP_BANNED"
    });
    res.status(403).json({ error: "Bu cihaz için erişim kısıtlandı." });
    return;
  }

  const username = normalizeUsername(parsed.data.username);
  const users = await query<UserRow>(
    `
      SELECT id, username, role, password_hash, is_banned, is_active, ban_reason, banned_until
      FROM users
      WHERE username = $1
      LIMIT 1
    `,
    [username]
  );

  if (users.length === 0) {
    await recordLoginAttempt({ username, userId: null, ipAddress, deviceInfo, success: false, failReason: "USER_NOT_FOUND" });
    res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı." });
    return;
  }

  const user = users[0];
  const passOk = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!passOk) {
    await query(
      `UPDATE users SET failed_login_count = failed_login_count + 1, last_failed_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [user.id]
    );
    await recordLoginAttempt({ username, userId: user.id, ipAddress, deviceInfo, success: false, failReason: "BAD_PASSWORD" });
    res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı." });
    return;
  }

  if (!user.is_active) {
    await recordLoginAttempt({ username, userId: user.id, ipAddress, deviceInfo, success: false, failReason: "INACTIVE" });
    res.status(403).json({ error: "Hesap pasif durumda." });
    return;
  }

  if (user.is_banned && !isBanActive(user)) {
    await query(
      `UPDATE users SET is_banned = FALSE, ban_reason = NULL, banned_until = NULL, updated_at = NOW() WHERE id = $1`,
      [user.id]
    );
    user.is_banned = false;
    user.ban_reason = null;
    user.banned_until = null;
  }

  if (isBanActive(user)) {
    await recordLoginAttempt({ username, userId: user.id, ipAddress, deviceInfo, success: false, failReason: "BANNED" });
    res.status(403).json({ error: "Hesap kullanıma kapatıldı." });
    return;
  }

  const session = await createSessionTokens({
    userId: user.id,
    username: user.username,
    role: user.role,
    ipAddress,
    deviceInfo
  });

  await query(
    `
      UPDATE users
      SET last_login_at = NOW(),
          last_seen_at = NOW(),
          login_count = login_count + 1,
          last_ip = $2,
          device_info = $3,
          updated_at = NOW()
      WHERE id = $1
    `,
    [user.id, ipAddress, deviceInfo]
  );
  await recordLoginAttempt({ username, userId: user.id, ipAddress, deviceInfo, success: true });
  await upsertUserDevice(user.id, ipAddress, deviceInfo);

  res.json({
    user: responseUser(user),
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    refreshExpiresAt: session.refreshExpiresAt
  });
});

authRouter.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Oturum yenileme isteği geçersiz." });
    return;
  }

  try {
    const payload = verifyJwt(parsed.data.refreshToken);
    if (payload.type !== "refresh") {
      res.status(401).json({ error: "Oturum doğrulanamadı." });
      return;
    }

    const rows = await query<{
      user_id: string;
      username: string;
      role: "ADMIN" | "USER";
      is_banned: boolean;
      is_active: boolean;
      banned_until: string | null;
      session_id: string;
    }>(
      `
        SELECT
          u.id AS user_id,
          u.username,
          u.role,
          u.is_banned,
          u.is_active,
          u.banned_until,
          s.id AS session_id
        FROM sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.id = $1
          AND s.refresh_token_hash = $2
          AND s.revoked_at IS NULL
          AND s.refresh_expires_at > NOW()
      `,
      [payload.sessionId, hashToken(parsed.data.refreshToken)]
    );

    if (rows.length === 0) {
      res.status(401).json({ error: "Oturum doğrulanamadı." });
      return;
    }

    const row = rows[0];
    const rowBanActive = row.is_banned && (!row.banned_until || new Date(row.banned_until).getTime() > Date.now());
    if (!row.is_active || rowBanActive) {
      await query(`UPDATE sessions SET revoked_at = NOW() WHERE id = $1`, [row.session_id]);
      res.status(403).json({ error: "Hesap erişimi kapalı." });
      return;
    }

    const accessToken = signAccessToken({
      sub: row.user_id,
      username: row.username,
      role: row.role,
      sessionId: row.session_id
    });

    const expiresAt = new Date(Date.now() + accessLifetimeMs).toISOString();

    await query(
      `
        UPDATE sessions
        SET token_hash = $2,
            expires_at = $3
        WHERE id = $1
      `,
      [row.session_id, hashToken(accessToken), expiresAt]
    );

    res.json({ accessToken, expiresAt });
  } catch {
    res.status(401).json({ error: "Oturum doğrulanamadı." });
  }
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: "Oturum doğrulanamadı." });
    return;
  }

  await query(`UPDATE sessions SET revoked_at = NOW() WHERE id = $1`, [req.auth.sessionId]);
  await createAuditLog({
    adminUserId: req.auth.role === "ADMIN" ? req.auth.userId : null,
    action: "LOGOUT",
    targetUserId: req.auth.userId,
    ipAddress: req.clientIpAddress,
    details: { sessionId: req.auth.sessionId }
  });

  res.json({ success: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: "Oturum doğrulanamadı." });
    return;
  }

  const rows = await query<{
    id: string;
    username: string;
    role: "ADMIN" | "USER";
    is_banned: boolean;
    is_active: boolean;
    ban_reason: string | null;
    banned_until: string | null;
  }>(
    `
      SELECT id, username, role, is_banned, is_active, ban_reason, banned_until
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [req.auth.userId]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Kullanıcı bulunamadı." });
    return;
  }

  const user = rows[0];
  res.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      isBanned: user.is_banned,
      isActive: user.is_active,
      banReason: user.ban_reason,
      bannedUntil: user.banned_until
    }
  });
});
