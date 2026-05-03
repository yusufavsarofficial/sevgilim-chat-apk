import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { AppData, AuthUser } from "./types";
import { ConsentBundle } from "./auth";

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || "https://puantaj-maas-backend.onrender.com").replace(/\/$/, "");
const ACCESS_TOKEN_KEY = "@puantaj-maas-apk:remote:access";
const REFRESH_TOKEN_KEY = "@puantaj-maas-apk:remote:refresh";
const DEFAULT_TIMEOUT_MS = 12000;
const HEALTH_TIMEOUT_MS = 7000;

const GENERIC_ERROR = "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
const APP_VERSION = "1.0.0";

type RemoteUser = {
  id: string;
  username: string;
  role: "USER" | "ADMIN";
};

type TokenState = {
  accessToken: string;
  refreshToken: string;
};

type AdminStats = {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  recentLogins: Array<{ id: string; username: string; lastLoginAt: string | null; lastIp: string | null }>;
};

type AdminUser = {
  id: string;
  username: string;
  role: "USER" | "ADMIN";
  isBanned: boolean;
  isActive: boolean;
  banReason: string | null;
  bannedUntil: string | null;
  failedLoginCount: number;
  createdAt: string;
  lastLoginAt: string | null;
  lastIp: string | null;
  deviceInfo: string | null;
};

type AdminUserDetail = {
  user: AdminUser;
  sessions: Array<{
    id: string;
    ipAddress: string | null;
    deviceInfo: string | null;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>;
  payroll: { data: unknown; updatedAt: string } | null;
  loginAttempts?: Array<{
    id: string;
    username: string;
    ipAddress: string | null;
    deviceInfo: string | null;
    success: boolean;
    failReason: string | null;
    createdAt: string;
  }>;
  devices?: Array<{
    id: string;
    fingerprint: string;
    deviceInfo: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    lastIp: string | null;
  }>;
  adminNotes?: Array<{ id: string; adminUserId: string | null; note: string; createdAt: string }>;
};

type AdminIpBan = {
  id: string;
  ipAddress: string;
  reason: string | null;
  createdAt: string;
};


function deviceHeaders(): Record<string, string> {
  return {
    "X-App-Version": APP_VERSION,
    "X-Device-Brand": Device.brand ?? "",
    "X-Device-Model": Device.modelName ?? "",
    "X-OS-Name": Device.osName ?? Platform.OS,
    "X-OS-Version": Device.osVersion ?? ""
  };
}
let inMemoryTokens: TokenState | null = null;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("İstek zaman aşımına uğradı.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toAuthUser(user: RemoteUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: new Date().toISOString()
  };
}

function sanitizeErrorMessage(message: string, fallback: string): string {
  const text = message.trim();
  if (!text) {
    return fallback;
  }

  const technicalKeywords = [
    "token",
    "endpoint",
    "backend",
    "api",
    "server",
    "stack",
    "request failed",
    "unauthorized",
    "jwt"
  ];

  const lower = text.toLowerCase();
  if (technicalKeywords.some((item) => lower.includes(item))) {
    return fallback;
  }
  return text;
}

async function readTokens(): Promise<TokenState | null> {
  if (inMemoryTokens) {
    return inMemoryTokens;
  }

  const [accessToken, refreshToken] = await Promise.all([
    AsyncStorage.getItem(ACCESS_TOKEN_KEY),
    AsyncStorage.getItem(REFRESH_TOKEN_KEY)
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  inMemoryTokens = { accessToken, refreshToken };
  return inMemoryTokens;
}

async function saveTokens(tokens: TokenState): Promise<void> {
  inMemoryTokens = tokens;
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, tokens.accessToken],
    [REFRESH_TOKEN_KEY, tokens.refreshToken]
  ]);
}

export async function clearRemoteSession(): Promise<void> {
  inMemoryTokens = null;
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

async function refreshAccessToken(): Promise<string | null> {
  const tokens = await readTokens();
  if (!tokens) {
    return null;
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...deviceHeaders()
    },
    body: JSON.stringify({ refreshToken: tokens.refreshToken })
  });

  if (!response.ok) {
    await clearRemoteSession();
    return null;
  }

  const data = (await response.json()) as { accessToken: string };
  const nextTokens = {
    accessToken: data.accessToken,
    refreshToken: tokens.refreshToken
  };
  await saveTokens(nextTokens);
  return data.accessToken;
}

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return sanitizeErrorMessage(payload.error || "", fallback);
  } catch {
    return fallback;
  }
}

async function authorizedFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const tokens = await readTokens();
  if (!tokens) {
    throw new Error("Oturum bulunamadı.");
  }

  const headers = {
    "Content-Type": "application/json",
    ...deviceHeaders(),
    ...(init.headers || {}),
    Authorization: `Bearer ${tokens.accessToken}`
  };

  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (response.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return authorizedFetch(path, init, true);
    }
  }

  return response;
}

export async function pingBackend(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/health`,
      { method: "GET" },
      HEALTH_TIMEOUT_MS
    );
    return response.ok;
  } catch {
    return false;
  }
}

export type BackendHealthCheckResult = {
  url: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  checkedAt: string;
};

export async function testBackendHealth(): Promise<BackendHealthCheckResult[]> {
  const paths = ["/api/health", "/health"];
  const results: BackendHealthCheckResult[] = [];
  for (const path of paths) {
    const url = `${API_BASE_URL}${path}`;
    try {
      const response = await fetchWithTimeout(url, { method: "GET" }, HEALTH_TIMEOUT_MS);
      results.push({
        url,
        ok: response.ok,
        status: response.status,
        error: response.ok ? null : `HTTP ${response.status}`,
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      results.push({
        url,
        ok: false,
        status: null,
        error: error instanceof Error ? error.message : "Network error",
        checkedAt: new Date().toISOString()
      });
    }
  }
  return results;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function remoteRegister(input: {
  username: string;
  password: string;
  inviteKey: string;
  consents: ConsentBundle;
}): Promise<AuthUser> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...deviceHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }

  const data = (await response.json()) as {
    user: RemoteUser;
    accessToken: string;
    refreshToken: string;
  };

  await saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return toAuthUser(data.user);
}

export async function remoteLogin(username: string, password: string): Promise<AuthUser> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...deviceHeaders()
    },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Kullanıcı adı veya şifre hatalı."));
  }

  const data = (await response.json()) as {
    user: RemoteUser;
    accessToken: string;
    refreshToken: string;
  };

  await saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return toAuthUser(data.user);
}

export async function remoteMe(): Promise<AuthUser | null> {
  const tokens = await readTokens();
  if (!tokens) {
    return null;
  }

  const response = await authorizedFetch("/api/auth/me", { method: "GET" });
  if (!response.ok) {
    await clearRemoteSession();
    return null;
  }

  const data = (await response.json()) as {
    user: {
      id: string;
      username: string;
      role: "USER" | "ADMIN";
      isBanned: boolean;
      isActive: boolean;
    };
  };

  if (!data.user.isActive || data.user.isBanned) {
    await clearRemoteSession();
    return null;
  }

  return toAuthUser(data.user);
}

export async function remoteLogout(): Promise<void> {
  try {
    await authorizedFetch("/api/auth/logout", {
      method: "POST"
    });
  } finally {
    await clearRemoteSession();
  }
}

export async function pullPayrollFromBackend(): Promise<AppData | null> {
  const response = await authorizedFetch("/api/payroll", { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }

  const data = (await response.json()) as { data: AppData | null };
  return data.data;
}

export async function pushPayrollToBackend(data: AppData): Promise<void> {
  const response = await authorizedFetch("/api/payroll", {
    method: "POST",
    body: JSON.stringify({ data })
  });

  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function sendSecuritySignal(payload: {
  emulator?: boolean;
  rooted?: boolean;
  debug?: boolean;
  developerMode?: boolean;
  details?: string;
}): Promise<void> {
  const response = await authorizedFetch("/api/security/device-signal", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminGetStats(): Promise<AdminStats> {
  const response = await authorizedFetch("/api/admin/stats", { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
  return (await response.json()) as AdminStats;
}

export async function adminGetUsers(search = ""): Promise<AdminUser[]> {
  const suffix = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
  const response = await authorizedFetch(`/api/admin/users${suffix}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
  const data = (await response.json()) as { users: AdminUser[] };
  return data.users;
}

export async function adminGetUserDetail(userId: string): Promise<AdminUserDetail> {
  const response = await authorizedFetch(`/api/admin/users/${userId}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
  return (await response.json()) as AdminUserDetail;
}

export async function adminCreateUser(payload: { username: string; password: string; role: "USER" | "ADMIN" }): Promise<void> {
  const response = await authorizedFetch("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminUpdateUser(
  userId: string,
  payload: { username?: string; password?: string; role?: "USER" | "ADMIN" }
): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminBanUser(userId: string, reason: string, durationHours?: number): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/ban`, {
    method: "POST",
    body: JSON.stringify({
      reason,
      durationHours: typeof durationHours === "number" && Number.isFinite(durationHours) && durationHours > 0
        ? durationHours
        : undefined
    })
  });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminUnbanUser(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/unban`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminDisableUser(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/disable`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminEnableUser(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/enable`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminDeleteUserData(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/data`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminRevokeUserSessions(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/revoke-sessions`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminAddUserNote(userId: string, note: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/notes`, {
    method: "POST",
    body: JSON.stringify({ note })
  });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminGetIpBans(): Promise<AdminIpBan[]> {
  const response = await authorizedFetch("/api/admin/ip-bans", { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
  const data = (await response.json()) as { items: AdminIpBan[] };
  return data.items;
}

export async function adminAddIpBan(ipAddress: string, reason?: string): Promise<void> {
  const response = await authorizedFetch("/api/admin/ip-bans", {
    method: "POST",
    body: JSON.stringify({
      ipAddress: ipAddress.trim(),
      reason: reason?.trim() || undefined
    })
  });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

export async function adminRemoveIpBan(banId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/ip-bans/${banId}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
}

