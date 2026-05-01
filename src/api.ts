import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppData, AuthUser } from "./types";

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || "https://puantaj-maas-api.onrender.com").replace(/\/$/, "");
const ACCESS_TOKEN_KEY = "@puantaj-maas-apk:remote:access";
const REFRESH_TOKEN_KEY = "@puantaj-maas-apk:remote:refresh";

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
};

let inMemoryTokens: TokenState | null = null;

function toAuthUser(user: RemoteUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: new Date().toISOString()
  };
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

  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
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
    return payload.error || fallback;
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
    ...(init.headers || {}),
    Authorization: `Bearer ${tokens.accessToken}`
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
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
    const response = await fetch(`${API_BASE_URL}/api/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function remoteRegister(input: {
  username: string;
  password: string;
  inviteKey: string;
  consents: { privacy: boolean; kvkk: boolean; cookies: boolean; legal: boolean };
}): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Kayıt başarısız."));
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
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Giriş başarısız."));
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
    throw new Error(await parseError(response, "Buluttan veri alınamadı."));
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
    throw new Error(await parseError(response, "Buluta veri kaydedilemedi."));
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
    throw new Error(await parseError(response, "Güvenlik sinyali iletilemedi."));
  }
}

export async function adminGetStats(): Promise<AdminStats> {
  const response = await authorizedFetch("/api/admin/stats", { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseError(response, "Admin istatistikleri alınamadı."));
  }
  return (await response.json()) as AdminStats;
}

export async function adminGetUsers(search = ""): Promise<AdminUser[]> {
  const suffix = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
  const response = await authorizedFetch(`/api/admin/users${suffix}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseError(response, "Kullanıcı listesi alınamadı."));
  }
  const data = (await response.json()) as { users: AdminUser[] };
  return data.users;
}

export async function adminGetUserDetail(userId: string): Promise<AdminUserDetail> {
  const response = await authorizedFetch(`/api/admin/users/${userId}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseError(response, "Kullanıcı detayı alınamadı."));
  }
  return (await response.json()) as AdminUserDetail;
}

export async function adminBanUser(userId: string, reason: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/ban`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Kullanıcı banlanamadı."));
  }
}

export async function adminUnbanUser(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/unban`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await parseError(response, "Ban kaldırılamadı."));
  }
}

export async function adminDisableUser(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/disable`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await parseError(response, "Kullanıcı pasif yapılamadı."));
  }
}

export async function adminEnableUser(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/enable`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await parseError(response, "Kullanıcı aktif yapılamadı."));
  }
}

export async function adminDeleteUserData(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/data`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await parseError(response, "Kullanıcı verisi silinemedi."));
  }
}

export async function adminRevokeUserSessions(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/admin/users/${userId}/revoke-sessions`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await parseError(response, "Oturumlar sonlandırılamadı."));
  }
}