import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { AuthUser, UserRole } from "./types";

export type ConsentBundle = {
  kvkk: boolean;
  acikRiza: boolean;
  gizlilik: boolean;
  cerez: boolean;
  cihazVerisi: boolean;
  kullanimSartlari: boolean;
  yasalSorumluluk: boolean;
  istegeBagliBildirim?: boolean;
};

type Account = AuthUser & {
  passwordHash: string;
  consentAcceptedAt: string;
  consentVersion: string;
  consentSnapshot: ConsentBundle;
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

type ConsentLogEntry = {
  id: string;
  userId: string;
  username: string;
  consentVersion: string;
  acceptedAt: string;
  consents: ConsentBundle;
};

const USERS_KEY = "@puantaj-maas-apk:auth:users:v5";
const SESSION_KEY = "@puantaj-maas-apk:auth:session:v5";
const SECURITY_KEY = "@puantaj-maas-apk:auth:security:v5";
const CONSENT_LOG_KEY = "@puantaj-maas-apk:auth:consent-log:v1";
const USER_DATA_PREFIX = "@puantaj-maas-apk:data:v5:";
export const CONSENT_VERSION = "2026.05.02";

const FIXED_ADMIN_USERNAME = "Ayf";
const FIXED_ADMIN_PASSWORD_HASH = "3bbe665633d6edfd61e91598560db3fee78a21da78b3fe77e9fefac5ecfc4cc1";
const FIXED_INVITE_KEY_HASH = "3825b97592ef25f0bb0fb784a3bfe0b016b1e27e134cff2379b69f85842cf52f";

const MAX_FAIL = 5;
const LOCK_MS = 5 * 60 * 1000;

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeUsername(value: string): string {
  return value.trim().replace(/\s+/g, " ");
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

function validateRequiredConsents(consents: ConsentBundle): boolean {
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

async function appendConsentLog(entry: Omit<ConsentLogEntry, "id">): Promise<void> {
  const current = await readJson<ConsentLogEntry[]>(CONSENT_LOG_KEY, []);
  const next: ConsentLogEntry = {
    ...entry,
    id: `consent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  };
  await writeJson(CONSENT_LOG_KEY, [next, ...current].slice(0, 2000));
}

export async function ensureDefaultSecurity(): Promise<void> {
  const adminUsernameNormalized = normalizeUsername(FIXED_ADMIN_USERNAME);
  const adminPasswordHash = FIXED_ADMIN_PASSWORD_HASH;
  const inviteKeyHash = FIXED_INVITE_KEY_HASH;

  const security = await readJson<SecurityState | null>(SECURITY_KEY, null);
  if (!security) {
    await writeJson<SecurityState>(SECURITY_KEY, {
      adminUsername: adminUsernameNormalized,
      adminPasswordHash,
      inviteKeyHash,
      failedLoginMap: {}
    });
  } else {
    security.adminUsername = adminUsernameNormalized;
    security.adminPasswordHash = adminPasswordHash;
    security.inviteKeyHash = inviteKeyHash;
    await writeJson(SECURITY_KEY, security);
  }

  const users = await readJson<Account[]>(USERS_KEY, []);
  const now = new Date().toISOString();
  const adminIndex = users.findIndex((item) => item.role === "ADMIN");
  const adminAccount: Account = {
    id: adminIndex >= 0 ? users[adminIndex].id : `admin-${Date.now()}`,
    username: FIXED_ADMIN_USERNAME,
    role: "ADMIN",
    createdAt: adminIndex >= 0 ? users[adminIndex].createdAt : now,
    passwordHash: adminPasswordHash,
    consentAcceptedAt: adminIndex >= 0 ? users[adminIndex].consentAcceptedAt : now,
    consentVersion: CONSENT_VERSION,
    consentSnapshot: {
      kvkk: true,
      acikRiza: true,
      gizlilik: true,
      cerez: true,
      cihazVerisi: true,
      kullanimSartlari: true,
      yasalSorumluluk: true,
      istegeBagliBildirim: false
    }
  };

  if (adminIndex >= 0) {
    users[adminIndex] = adminAccount;
  } else {
    users.push(adminAccount);
    await appendConsentLog({
      userId: adminAccount.id,
      username: adminAccount.username,
      consentVersion: CONSENT_VERSION,
      acceptedAt: now,
      consents: adminAccount.consentSnapshot
    });
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
    throw new Error("İşlem tamamlanamadı. Lütfen tekrar deneyin.");
  }

  if (!validateRequiredConsents(input.consents)) {
    throw new Error("Zorunlu onaylar tamamlanmadan devam edilemez.");
  }

  const normalized = normalizeUsername(input.username);
  const displayUsername = sanitizeUsername(input.username);
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
    username: displayUsername,
    role: "USER",
    createdAt: now,
    passwordHash: await hashText(input.password),
    consentAcceptedAt: now,
    consentVersion: CONSENT_VERSION,
    consentSnapshot: input.consents
  };

  await writeJson(USERS_KEY, [...users, account]);
  await appendConsentLog({
    userId: account.id,
    username: account.username,
    consentVersion: CONSENT_VERSION,
    acceptedAt: now,
    consents: input.consents
  });

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
    throw new Error("Kullanıcı adı veya şifre hatalı.");
  }

  const passwordHash = await hashText(password);
  if (passwordHash !== account.passwordHash) {
    await increaseFail(normalized);
    throw new Error("Kullanıcı adı veya şifre hatalı.");
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

export async function isConsentCurrent(userId: string): Promise<boolean> {
  const users = await readJson<Account[]>(USERS_KEY, []);
  const account = users.find((item) => item.id === userId);
  if (!account) {
    return false;
  }
  return account.consentVersion === CONSENT_VERSION;
}

export async function saveUserConsent(user: AuthUser, consents: ConsentBundle): Promise<void> {
  if (!validateRequiredConsents(consents)) {
    throw new Error("Zorunlu onaylar tamamlanmadan devam edilemez.");
  }

  const users = await readJson<Account[]>(USERS_KEY, []);
  const index = users.findIndex((item) => item.id === user.id);
  if (index < 0) {
    throw new Error("İşlem tamamlanamadı. Lütfen tekrar deneyin.");
  }

  const acceptedAt = new Date().toISOString();
  users[index] = {
    ...users[index],
    consentAcceptedAt: acceptedAt,
    consentVersion: CONSENT_VERSION,
    consentSnapshot: consents
  };

  await writeJson(USERS_KEY, users);
  await appendConsentLog({
    userId: user.id,
    username: user.username,
    consentVersion: CONSENT_VERSION,
    acceptedAt,
    consents
  });
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
    throw new Error("Yönetici hesabı silinemez.");
  }

  const nextUsers = users.filter((item) => item.id !== userId);
  await writeJson(USERS_KEY, nextUsers);
  await AsyncStorage.removeItem(`${USER_DATA_PREFIX}${userId}`);
}
