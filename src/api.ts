import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { AppData, AuthUser } from "./types";
import { ConsentBundle } from "./auth";

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || "https://puantaj-maas-backend.onrender.com").replace(/\/$/, "");
const ACCESS_TOKEN_KEY = "@puantaj-maas-apk:remote:access";
const REFRESH_TOKEN_KEY = "@puantaj-maas-apk:remote:refresh";
const LOCAL_USERS_KEY = "@puantaj-maas-apk:local-fallback:users";
const LOCAL_SESSION_KEY = "@puantaj-maas-apk:local-fallback:session";
const DEFAULT_TIMEOUT_MS = 12000;
const HEALTH_TIMEOUT_MS = 7000;

const GENERIC_ERROR = "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
export const APP_VERSION = "1.0.2";

type RemoteUser = {
  id: string;
  username: string;
  role: "USER" | "ADMIN";
};

type TokenState = {
  accessToken: string;
  refreshToken: string;
};

type LocalFallbackUser = {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordHash: string;
  securityQuestion: string;
  securityAnswerHash: string;
  role: "USER";
  createdAt: string;
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

function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

function sanitizeUsername(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function hashText(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

async function readLocalUsers(): Promise<LocalFallbackUser[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_USERS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalUsers(users: LocalFallbackUser[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

function toLocalAuthUser(user: LocalFallbackUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt
  };
}

async function saveLocalSession(user: AuthUser): Promise<void> {
  await AsyncStorage.setItem(
    LOCAL_SESSION_KEY,
    JSON.stringify({
      userId: user.id,
      createdAt: new Date().toISOString()
    })
  );
}

async function readLocalSession(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw) as { userId?: string };
    if (!session.userId) {
      return null;
    }
    const users = await readLocalUsers();
    const user = users.find((item) => item.id === session.userId);
    return user ? toLocalAuthUser(user) : null;
  } catch {
    return null;
  }
}

async function clearLocalSession(): Promise<void> {
  await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
}

function requiredConsentsAccepted(consents: ConsentBundle): boolean {
  return Boolean(
    consents.kvkk &&
      consents.acikRiza &&
      consents.gizlilik &&
      consents.cerez &&
      consents.cihazVerisi &&
      consents.kullanimSartlari &&
      consents.yasalSorumluluk
  );
}

function isBackendUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const text = error.message.toLowerCase();
  return (
    text.includes("network request failed") ||
    text.includes("istek zaman aşımına") ||
    text.includes("failed to fetch") ||
    text.includes("network error")
  );
}

function isBackendUnavailableResponse(response: Response): boolean {
  return response.status === 404 || response.status === 502 || response.status === 503 || response.status === 504;
}

async function localFallbackRegister(input: {
  username: string;
  password: string;
  inviteKey: string;
  securityQuestion: string;
  securityAnswer: string;
  consents: ConsentBundle;
}): Promise<AuthUser> {
  const normalizedUsername = normalizeUsername(input.username);
  const username = sanitizeUsername(input.username);
  const securityQuestion = input.securityQuestion.trim();
  const securityAnswer = input.securityAnswer.trim();

  if (!username || normalizedUsername.length < 3 || input.password.length < 6) {
    throw new Error("Kullanıcı adı en az 3, şifre en az 6 karakter olmalıdır.");
  }
  if (!input.inviteKey.trim()) {
    throw new Error("Kayıt anahtarı zorunludur.");
  }
  if (securityQuestion.length < 5 || securityAnswer.length < 2) {
    throw new Error("Güvenlik sorusu ve cevabı zorunludur.");
  }
  if (!requiredConsentsAccepted(input.consents)) {
    throw new Error("Zorunlu onaylar tamamlanmadan kayıt yapılamaz.");
  }

  const users = await readLocalUsers();
  if (users.some((item) => item.normalizedUsername === normalizedUsername)) {
    throw new Error("Bu kullanıcı adı zaten kayıtlı.");
  }

  const now = new Date().toISOString();
  const user: LocalFallbackUser = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username,
    normalizedUsername,
    passwordHash: await hashText(input.password),
    securityQuestion,
    securityAnswerHash: await hashText(securityAnswer.toLocaleLowerCase("tr-TR")),
    role: "USER",
    createdAt: now
  };

  await saveLocalUsers([...users, user]);
  const authUser = toLocalAuthUser(user);
  await saveLocalSession(authUser);
  return authUser;
}

async function localFallbackLogin(username: string, password: string): Promise<AuthUser> {
  const normalizedUsername = normalizeUsername(username);
  const users = await readLocalUsers();
  const user = users.find((item) => item.normalizedUsername === normalizedUsername);
  if (!user || user.passwordHash !== (await hashText(password))) {
    throw new Error("Kullanıcı adı veya şifre hatalı.");
  }
  const authUser = toLocalAuthUser(user);
  await saveLocalSession(authUser);
  return authUser;
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

export type AppUpdateInfo = {
  version: string;
  message: string;
  apkUrl: string;
  required: boolean;
  updatedAt: string | null;
};

export async function getAppUpdateInfo(): Promise<AppUpdateInfo | null> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/app-update`, { method: "GET" }, HEALTH_TIMEOUT_MS);
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { update?: Partial<AppUpdateInfo> | null; updatedAt?: string | null };
  if (!data.update) {
    return null;
  }
  return {
    version: String(data.update.version ?? ""),
    message: String(data.update.message ?? ""),
    apkUrl: String(data.update.apkUrl ?? ""),
    required: Boolean(data.update.required),
    updatedAt: typeof data.update.updatedAt === "string" ? data.update.updatedAt : data.updatedAt ?? null
  };
}

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
  securityQuestion: string;
  securityAnswer: string;
  consents: ConsentBundle;
}): Promise<AuthUser> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...deviceHeaders()
      },
      body: JSON.stringify(input)
    });
  } catch (error) {
    if (isBackendUnavailableError(error)) {
      return localFallbackRegister(input);
    }
    throw error;
  }

  if (!response.ok) {
    if (isBackendUnavailableResponse(response)) {
      return localFallbackRegister(input);
    }
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
  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...deviceHeaders()
      },
      body: JSON.stringify({ username, password })
    });
  } catch (error) {
    if (isBackendUnavailableError(error)) {
      return localFallbackLogin(username, password);
    }
    throw error;
  }

  if (!response.ok) {
    if (isBackendUnavailableResponse(response)) {
      return localFallbackLogin(username, password);
    }
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
    return readLocalSession();
  }

  let response: Response;
  try {
    response = await authorizedFetch("/api/auth/me", { method: "GET" });
  } catch (error) {
    if (isBackendUnavailableError(error)) {
      return readLocalSession();
    }
    throw error;
  }
  if (!response.ok) {
    if (isBackendUnavailableResponse(response)) {
      return readLocalSession();
    }
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
    await clearLocalSession();
  }
}

export async function remoteGetSecurityQuestion(username: string): Promise<string> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/forgot-password/question`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...deviceHeaders()
    },
    body: JSON.stringify({ username })
  });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
  const data = (await response.json()) as { securityQuestion: string };
  return data.securityQuestion;
}

export async function remoteResetPasswordWithSecurityAnswer(input: {
  username: string;
  securityAnswer: string;
  newPassword: string;
}): Promise<void> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/forgot-password/reset`, {
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
}

export async function remoteDeleteOwnAccount(input: { password: string; securityAnswer: string }): Promise<void> {
  const response = await authorizedFetch("/api/auth/me", {
    method: "DELETE",
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
  await clearRemoteSession();
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

export async function adminPurgeUsers(): Promise<{ deletedUsers: number; protectedAdmins: number }> {
  const response = await authorizedFetch("/api/admin/users", { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await parseError(response, GENERIC_ERROR));
  }
  const data = (await response.json()) as { deletedUsers: number; protectedAdmins: number };
  return {
    deletedUsers: Number(data.deletedUsers ?? 0),
    protectedAdmins: Number(data.protectedAdmins ?? 0)
  };
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

