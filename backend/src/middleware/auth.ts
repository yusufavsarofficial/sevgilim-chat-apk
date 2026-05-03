import { NextFunction, Request, Response } from "express";
import { query } from "../db.js";
import { hashToken } from "../utils/security.js";
import { verifyJwt } from "../utils/tokens.js";

type AuthRow = {
  user_id: string;
  username: string;
  role: "ADMIN" | "USER";
  is_banned: boolean;
  is_active: boolean;
  banned_until: string | null;
  session_id: string;
};

function unauthorized(res: Response): void {
  res.status(401).json({ error: "Oturum doğrulanamadı. Lütfen yeniden giriş yapın." });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    unauthorized(res);
    return;
  }

  try {
    const payload = verifyJwt(token);
    if (payload.type !== "access") {
      unauthorized(res);
      return;
    }

    const tokenHash = hashToken(token);
    const rows = await query<AuthRow>(
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
          AND s.token_hash = $2
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND u.id = $3
      `,
      [payload.sessionId, tokenHash, payload.sub]
    );

    if (rows.length === 0) {
      unauthorized(res);
      return;
    }

    const row = rows[0];
    if (!row.is_active) {
      res.status(403).json({ error: "Hesap pasif durumda." });
      return;
    }

    const banActive = row.is_banned && (!row.banned_until || new Date(row.banned_until).getTime() > Date.now());
    if (banActive) {
      res.status(403).json({ error: "Hesap kullanıma kapatıldı." });
      return;
    }

    if (req.clientIpAddress) {
      const bannedIps = await query<{ id: string }>(
        `SELECT id FROM ip_bans WHERE ip_address = $1 LIMIT 1`,
        [req.clientIpAddress]
      );
      if (bannedIps.length > 0) {
        res.status(403).json({ error: "Bu cihaz için erişim kısıtlandı." });
        return;
      }
    }

    req.auth = {
      userId: row.user_id,
      username: row.username,
      role: row.role,
      token,
      sessionId: row.session_id
    };

    next();
  } catch {
    unauthorized(res);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.role !== "ADMIN") {
    res.status(403).json({ error: "Bu işlem için yönetici yetkisi gerekir." });
    return;
  }
  next();
}
