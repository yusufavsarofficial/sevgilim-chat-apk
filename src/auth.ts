import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { AuthUser, UserRole } from "./types";

type ConsentBundle = {
  privacy: boolean;
  kvkk: boolean;
  cookies: boolean;
  legal: boolean;
};

type Account = AuthUser & {
  passwordHash: string;
  consentAcceptedAt: string;
  consentVersion: string;
};

type SessionState = {
  userId: string;
  username: string;
  role: UserRole;
  createdAt: string;
};

type SecurityState = {
  inviteKeyHash: string;
  adminUsername: string;
  adminPasswordHash: string;
  failedLoginMap: Record<string, { count: number; lockUntil: number }>;
};

const USERS_KEY = "@puantaj-maas-apk:auth:users:v4";
const SESSION_KEY = "@puantaj-maas-apk:auth:session:v4";
const SECURITY_KEY = "@puantaj-maas-apk:auth:security:v4";
const USER_DATA_PREFIX = "@puantaj-maas-apk:data:v5:";
const CONSENT_VERSION = "2026-05-01";

const FIXED_ADMIN_USERNAME = "Yusuf";
const FIXED_ADMIN_PASSWORD = "Yusuf123";
const FIXED_INVITE_KEY = "2026Yusuf";

const MAX_FAIL = 5;
const LOCK_MS = 5 * 60 * 1000;

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

async function hashText(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function toAuthUser(account: Account): AuthUser {
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    createdAt: account.createdAt
  };
}

export async function ensureDefaultSecurity(): Promise<void> {
  const adminUsername = normalizeUsername(FIXED_ADMIN_USERNAME);
  const adminPasswordHash = await hashText(FIXED_ADMIN_PASSWORD);
  const inviteKeyHash = await hashText(FIXED_INVITE_KEY);

  const security = await readJson<SecurityState | null>(SECURITY_KEY, null);
  if (!security) {
    await writeJson<SecurityState>(SECURITY_KEY, {
      adminUsername,
      adminPasswordHash,
      inviteKeyHash,
      failedLoginMap: {}
    });
  } else {
    security.adminUsername = adminUsername;
    security.adminPasswordHash = adminPasswordHash;
    security.inviteKeyHash = inviteKeyHash;
    await writeJson(SECURITY_KEY, security);
  }

  const users = await readJson<Account[]>(USERS_KEY, []);
  const now = new Date().toISOString();
  const adminIndex = users.findIndex((item) => item.role === "ADMIN");
  const adminAccount: Account = {
    id: adminIndex >= 0 ? users[adminIndex].id : `admin-${Date.now()}`,
    username: adminUsername,
    role: "ADMIN",
    createdAt: adminIndex >= 0 ? users[adminIndex].createdAt : now,
    passwordHash: adminPasswordHash,
    consentAcceptedAt: adminIndex >= 0 ? users[adminIndex].consentAcceptedAt : now,
    consentVersion: CONSENT_VERSION
  };

  if (adminIndex >= 0) {
    users[adminIndex] = adminAccount;
  } else {
    users.push(adminAccount);
  }

  await writeJson(USERS_KEY, users);
}

async function ensureNotLocked(username: string): Promise<void> {
  const security = await readJson<SecurityState | null>(SECURITY_KEY, null);
  const normalized = normalizeUsername(username);
  const lock = security?.failedLoginMap?.[normalized];
  if (!lock) {
    return;
  }
  if (lock.lockUntil > Date.now()) {
    const seconds = Math.ceil((lock.lockUntil - Date.now()) / 1000);
    throw new Error(`Hesap geçici olarak kilitlendi. ${seconds} saniye sonra tekrar deneyin.`);
  }
}

async function increaseFail(username: string): Promise<void> {
  const security = await readJson<SecurityState | null>(SECURITY_KEY, null);
  if (!security) {
    return;
  }
  const normalized = normalizeUsername(username);
  const current = security.failedLoginMap[normalized] ?? { count: 0, lockUntil: 0 };
  const nextCount = current.count + 1;
  const lockUntil = nextCount >= MAX_FAIL ? Date.now() + LOCK_MS : 0;
  security.failedLoginMap[normalized] = {
    count: nextCount,
    lockUntil
  };
  await writeJson(SECURITY_KEY, security);
}

async function clearFail(username: string): Promise<void> {
  const security = await readJson<SecurityState | null>(SECURITY_KEY, null);
  if (!security) {
    return;
  }
  const normalized = normalizeUsername(username);
  if (security.failedLoginMap[normalized]) {
    delete security.failedLoginMap[normalized];
    await writeJson(SECURITY_KEY, security);
  }
}

export async function registerUser(input: {
  username: string;
  password: string;
  inviteKey: string;
  consents: ConsentBundle;
}): Promise<AuthUser> {
  await ensureDefaultSecurity();
  const security = await readJson<SecurityState | null>(SECURITY_KEY, null);
  if (!security) {
    throw new Error("Güvenlik ayarları yüklenemedi.");
  }

  if (!input.consents.privacy || !input.consents.kvkk || !input.consents.cookies || !input.consents.legal) {
    throw new Error("Tüm zorunlu onaylar işaretlenmelidir.");
  }

  const normalized = normalizeUsername(input.username);
  if (normalized.length < 3 || input.password.length < 6) {
    throw new Error("Kullanıcı adı en az 3, şifre en az 6 karakter olmalıdır.");
  }

  const inviteHash = await hashText(input.inviteKey.trim());
  if (inviteHash !== security.inviteKeyHash) {
    throw new Error("Kayıt anahtarı geçersiz.");
  }

  const users = await readJson<Account[]>(USERS_KEY, []);
  if (users.some((item) => normalizeUsername(item.username) === normalized)) {
    throw new Error("Bu kullanıcı adı zaten kayıtlı.");
  }

  const now = new Date().toISOString();
  const account: Account = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    username: normalized,
    role: "USER",
    createdAt: now,
    passwordHash: await hashText(input.password),
    consentAcceptedAt: now,
    consentVersion: CONSENT_VERSION
  };

  await writeJson(USERS_KEY, [...users, account]);

  const authUser = toAuthUser(account);
  await writeJson<SessionState>(SESSION_KEY, {
    userId: authUser.id,
    username: authUser.username,
    role: authUser.role,
    createdAt: new Date().toISOString()
  });

  return authUser;
}

export async function loginUser(username: string, password: string, role: UserRole): Promise<AuthUser> {
  await ensureDefaultSecurity();
  const normalized = normalizeUsername(username);
  await ensureNotLocked(normalized);

  const users = await readJson<Account[]>(USERS_KEY, []);
  const account = users.find((item) => normalizeUsername(item.username) === normalized && item.role === role);

  if (!account) {
    await increaseFail(normalized);
    throw new Error("Kullanıcı bulunamadı.");
  }

  const passwordHash = await hashText(password);
  if (passwordHash !== account.passwordHash) {
    await increaseFail(normalized);
    throw new Error("Şifre hatalı.");
  }

  await clearFail(normalized);

  const authUser = toAuthUser(account);
  await writeJson<SessionState>(SESSION_KEY, {
    userId: authUser.id,
    username: authUser.username,
    role: authUser.role,
    createdAt: new Date().toISOString()
  });

  return authUser;
}

export async function loadSession(): Promise<AuthUser | null> {
  const session = await readJson<SessionState | null>(SESSION_KEY, null);
  if (!session) {
    return null;
  }

  const users = await readJson<Account[]>(USERS_KEY, []);
  const account = users.find((item) => item.id === session.userId && item.role === session.role);
  if (!account) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }

  return toAuthUser(account);
}

export async function logout(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function removeUserAccount(userId: string): Promise<void> {
  const users = await readJson<Account[]>(USERS_KEY, []);
  const target = users.find((item) => item.id === userId);
  if (!target) {
    return;
  }
  if (target.role === "ADMIN") {
    throw new Error("Admin hesabı silinemez.");
  }

  const nextUsers = users.filter((item) => item.id !== userId);
  await writeJson(USERS_KEY, nextUsers);
  await AsyncStorage.removeItem(`${USER_DATA_PREFIX}${userId}`);
}
