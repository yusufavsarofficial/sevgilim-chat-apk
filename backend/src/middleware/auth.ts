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
  session_id: string;
};

function unauthorized(res: Response, message: string): void {
  res.status(401).json({ error: message });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    unauthorized(res, "Yetkisiz erişim.");
    return;
  }

  try {
    const payload = verifyJwt(token);
    if (payload.type !== "access") {
      unauthorized(res, "Geçersiz oturum türü.");
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
      unauthorized(res, "Oturum süresi doldu veya geçersiz.");
      return;
    }

    const row = rows[0];
    if (!row.is_active) {
      res.status(403).json({ error: "Hesap pasif durumda." });
      return;
    }

    if (row.is_banned) {
      res.status(403).json({ error: "Hesap banlı durumda." });
      return;
    }

    if (req.clientIpAddress) {
      const bannedIps = await query<{ id: string }>(
        `SELECT id FROM ip_bans WHERE ip_address = $1 LIMIT 1`,
        [req.clientIpAddress]
      );
      if (bannedIps.length > 0) {
        res.status(403).json({ error: "IP erişimi kısıtlandı." });
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
    unauthorized(res, "Geçersiz token.");
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.role !== "ADMIN") {
    res.status(403).json({ error: "Bu işlem için admin yetkisi gerekiyor." });
    return;
  }
  next();
}