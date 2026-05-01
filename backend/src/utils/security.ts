import crypto from "node:crypto";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function parseDurationToMs(value: string, fallbackMs: number): number {
  const trimmed = value.trim();
  const match = /^(\d+)([smhd])$/i.exec(trimmed);
  if (!match) {
    return fallbackMs;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const unitFactor: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  };

  return amount * (unitFactor[unit] ?? 1);
}

export function safeJson(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}