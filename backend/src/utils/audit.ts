import { query } from "../db.js";

export async function createAuditLog(input: {
  adminUserId: string | null;
  action: string;
  targetUserId?: string | null;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `
      INSERT INTO audit_logs (admin_user_id, action, target_user_id, ip_address, details)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.adminUserId,
      input.action,
      input.targetUserId ?? null,
      input.ipAddress ?? null,
      JSON.stringify(input.details ?? {})
    ]
  );
}