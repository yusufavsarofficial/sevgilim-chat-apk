import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createWorkedRecord,
  DEFAULT_DATA,
  isIsoDate,
  normalizeMonthPayment,
  safePositive,
  tryParseNumber
} from "./payroll";
import { AppData, DayRecord, DayStatus, LegalSettings, ShiftRecord, TerminationType } from "./types";

const STORAGE_KEY_PREFIX = "@puantaj-maas-apk:data:v3";
const LEGACY_KEYS = ["@puantaj-maas-apk:data:v2", "@puantaj-maas-apk:data:v1"];

function normalizeStatus(value: unknown): DayStatus | null {
  if (value === "WORKED") return "WORKED";
  if (value === "LEAVE") return "LEAVE";
  if (value === "ANNUAL_LEAVE") return "ANNUAL_LEAVE";
  if (value === "REPORT") return "REPORT";
  if (value === "HOLIDAY_OFF") return "HOLIDAY_OFF";
  return null;
}

function legacyShiftHours(shift: ShiftRecord): { totalHours: number; overtimeHours: number } {
  const start = new Date(shift.startAt);
  const end = new Date(shift.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { totalHours: 12, overtimeHours: 4.5 };
  }
  const rawHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const breakHours = safePositive(shift.breakMinutes) / 60;
  const totalHours = Math.max(0, rawHours - breakHours);
  const overtimeHours = Math.max(0, totalHours - 7.5);
  return {
    totalHours: Math.round((totalHours + Number.EPSILON) * 100) / 100,
    overtimeHours: Math.round((overtimeHours + Number.EPSILON) * 100) / 100
  };
}

function normalizeDayRecordMap(raw: unknown, fallbackData: AppData): Record<string, DayRecord> {
  const records: Record<string, DayRecord> = {};
  if (!raw || typeof raw !== "object") {
    return records;
  }

  for (const [dateKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isIsoDate(dateKey) || !value || typeof value !== "object") {
      continue;
    }
    const source = value as Partial<DayRecord>;
    const status = normalizeStatus(source.status);

    records[dateKey] = {
      dateKey,
      status,
      isManual: typeof source.isManual === "boolean" ? source.isManual : true,
      work:
        source.work && typeof source.work === "object"
          ? {
              start: String(source.work.start ?? fallbackData.settings.defaultShiftStart),
              end: String(source.work.end ?? fallbackData.settings.defaultShiftEnd),
              totalHours: safePositive(tryParseNumber(String(source.work.totalHours ?? 0))),
              overtimeHours: safePositive(tryParseNumber(String(source.work.overtimeHours ?? 0)))
            }
          : status === "WORKED"
            ? {
                start: fallbackData.settings.defaultShiftStart,
                end: fallbackData.settings.defaultShiftEnd,
                totalHours: fallbackData.settings.defaultShiftHours,
                overtimeHours: fallbackData.settings.defaultOvertimeHours
              }
            : null,
      note: typeof source.note === "string" ? source.note : "",
      updatedAt:
        typeof source.updatedAt === "string" && source.updatedAt.length > 0
          ? source.updatedAt
          : new Date().toISOString()
    };
  }

  return records;
}

function normalizeTerminationType(value: unknown): TerminationType {
  if (value === "EMPLOYER_TERMINATION") return value;
  if (value === "EMPLOYEE_RESIGNATION") return value;
  if (value === "JUST_CAUSE_EMPLOYEE") return value;
  if (value === "MUTUAL_AGREEMENT") return value;
  return "EMPLOYER_TERMINATION";
}

function normalizeLegalSettings(raw: unknown): LegalSettings {
  const fallback = DEFAULT_DATA.legal;
  if (!raw || typeof raw !== "object") {
    return { ...fallback };
  }

  const source = raw as Partial<LegalSettings> & { usedAnnualLeaveDays?: number };
  const legacyUnused =
    typeof source.unusedAnnualLeaveDays === "number"
      ? source.unusedAnnualLeaveDays
      : typeof source.usedAnnualLeaveDays === "number"
        ? source.usedAnnualLeaveDays
        : fallback.unusedAnnualLeaveDays;

  return {
    hireDate: typeof source.hireDate === "string" ? source.hireDate : fallback.hireDate,
    terminationDate: typeof source.terminationDate === "string" ? source.terminationDate : fallback.terminationDate,
    grossSalary: safePositive(tryParseNumber(String(source.grossSalary ?? fallback.grossSalary))),
    unusedAnnualLeaveDays: safePositive(tryParseNumber(String(legacyUnused))),
    terminationType: normalizeTerminationType(source.terminationType)
  };
}

function mergeWithDefaults(parsed: Partial<AppData>): AppData {
  const baseSettings = {
    ...DEFAULT_DATA.settings,
    ...(parsed.settings ?? {}),
    coefficients: {
      ...DEFAULT_DATA.settings.coefficients,
      ...(parsed.settings?.coefficients ?? {})
    }
  };

  const baseData: AppData = {
    ...DEFAULT_DATA,
    ...parsed,
    settings: baseSettings,
    dayRecords: {},
    paidByMonth: {},
    holidayDates: Array.isArray(parsed.holidayDates)
      ? [...new Set(parsed.holidayDates.filter(isIsoDate))].sort()
      : DEFAULT_DATA.holidayDates,
    closedMonths: parsed.closedMonths && typeof parsed.closedMonths === "object" ? parsed.closedMonths : {},
    cloud: {
      ...DEFAULT_DATA.cloud,
      ...(parsed.cloud ?? {})
    },
    legal: normalizeLegalSettings(parsed.legal),
    shifts: Array.isArray(parsed.shifts) ? parsed.shifts : [],
    activeSession: null
  };

  const normalizedRecords = normalizeDayRecordMap(parsed.dayRecords, baseData);

  if (Object.keys(normalizedRecords).length === 0 && Array.isArray(parsed.shifts)) {
    for (const shift of parsed.shifts) {
      const dateKey = shift?.startAt?.slice(0, 10);
      if (!dateKey || !isIsoDate(dateKey)) {
        continue;
      }
      const legacy = createWorkedRecord(dateKey, baseSettings, true);
      const hours = legacyShiftHours(shift);
      normalizedRecords[dateKey] = {
        ...legacy,
        work: {
          start: legacy.work?.start ?? baseSettings.defaultShiftStart,
          end: legacy.work?.end ?? baseSettings.defaultShiftEnd,
          totalHours: hours.totalHours,
          overtimeHours: hours.overtimeHours
        },
        note: shift.note ?? ""
      };
    }
  }

  const paidByMonth: Record<string, ReturnType<typeof normalizeMonthPayment>> = {};
  if (parsed.paidByMonth && typeof parsed.paidByMonth === "object") {
    for (const [monthKey, value] of Object.entries(parsed.paidByMonth)) {
      paidByMonth[monthKey] = normalizeMonthPayment(value);
    }
  }

  return {
    ...baseData,
    dayRecords: normalizedRecords,
    paidByMonth
  };
}

function userStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

async function readFirstAvailable(userId: string): Promise<string | null> {
  const primary = await AsyncStorage.getItem(userStorageKey(userId));
  if (primary) {
    return primary;
  }
  for (const key of LEGACY_KEYS) {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      return raw;
    }
  }
  return null;
}

export async function loadAppData(userId: string): Promise<AppData> {
  try {
    const raw = await readFirstAvailable(userId);
    if (!raw) {
      return DEFAULT_DATA;
    }
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return mergeWithDefaults(parsed);
  } catch {
    return DEFAULT_DATA;
  }
}

export async function saveAppData(data: AppData, userId: string): Promise<void> {
  await AsyncStorage.setItem(userStorageKey(userId), JSON.stringify(data));
}

