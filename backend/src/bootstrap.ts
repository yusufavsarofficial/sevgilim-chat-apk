import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { query } from "./db.js";
import { normalizeUsername } from "./utils/security.js";

export async function ensureAdminUser(): Promise<void> {
  const username = normalizeUsername(config.ADMIN_USERNAME);
  const passwordHash = config.ADMIN_PASSWORD_HASH.toLowerCase();

  const existing = await query<{ id: string }>(
    `SELECT id FROM users WHERE username = $1 LIMIT 1`,
    [username]
  );

  if (existing.length === 0) {
    await query(
      `
        INSERT INTO users (username, password_hash, role, is_active, is_banned)
        VALUES ($1, $2, 'ADMIN', TRUE, FALSE)
      `,
      [username, passwordHash]
    );
    return;
  }

  await query(
    `
      UPDATE users
      SET password_hash = $2,
          role = 'ADMIN',
          is_active = TRUE,
          is_banned = FALSE,
          ban_reason = NULL
      WHERE username = $1
    `,
    [username, passwordHash]
  );
}
