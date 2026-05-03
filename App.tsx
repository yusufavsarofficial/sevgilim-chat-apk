import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as FileSystem from "expo-file-system/legacy";
import * as NavigationBar from "expo-navigation-bar";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Device from "expo-device";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildResignationDraft,
  buildMonthGrid,
  calculateDailyOvertimeHours,
  calculateMonthlyAnalytics,
  calculateLegalResult,
  calculateMonthlySummary,
  createStatusRecord,
  createWorkedRecord,
  currentMonthKey,
  dateKeyToDate,
  dayStatusColor,
  dayStatusLabel,
  dayStatusShort,
  dayTypeLabel,
  dayTypeOf,
  isMealTransportEligible,
  DEFAULT_DATA,
  differenceColor,
  formatCurrency,
  formatDateKeyTr,
  formatSignedCurrency,
  isIsoDate,
  isTrDate,
  isMonthKey,
  maskTrDateInput,
  monthLabelTr,
  monthlyDifferenceLabel,
  nextMonthKey,
  prevMonthKey,
  round2,
  safePositive,
  totalDifferenceForAllMonths,
  tryParseNumber
} from "./src/payroll";
import { loadAppData, saveAppData } from "./src/storage";
import {
  ensureDefaultSecurity,
  loadSession as loadLocalSession,
  loginUser as localLoginUser,
  logout as localLogoutUser,
  registerUser as localRegisterUser
} from "./src/auth";
import {
  adminBanUser,
  adminDeleteUserData,
  adminDisableUser,
  adminEnableUser,
  adminGetIpBans,
  adminGetStats,
  adminGetUserDetail,
  adminGetUsers,
  adminAddIpBan,
  adminAddUserNote,
  adminRemoveIpBan,
  adminRevokeUserSessions,
  adminUnbanUser,
  getApiBaseUrl,
  pingBackend,
  pullPayrollFromBackend,
  pushPayrollToBackend,
  remoteLogin,
  remoteLogout,
  remoteMe,
  remoteRegister,
  sendSecuritySignal,
  testBackendHealth
} from "./src/api";
import {
  AppData,
  AuthUser,
  DayRecord,
  DayStatus,
  LegalSettings,
  MonthPayment,
  ResignationTemplateKey,
  TerminationType
} from "./src/types";

type Tab = "CALENDAR" | "SUMMARY" | "SETTINGS" | "SYNC" | "LEGAL" | "USERS" | "APP_SETTINGS" | "SUPPORT";
type PaymentField = keyof MonthPayment;
type NumericSettingKey =
  | "monthlySalary"
  | "monthlyBaseHours"
  | "weeklyOvertimeThresholdHours"
  | "dailyOvertimeThresholdHours"
  | "defaultShiftHours"
  | "defaultOvertimeHours"
  | "monthlyMealAllowance"
  | "monthlyTransportAllowance"
  | "salaryPaymentDay"
  | "monthlyTarget";

const WEEK_LABELS = ["Pzt", "Sal", "Ã‡ar", "Per", "Cum", "Cmt", "Paz"];
const TERMINATION_TYPE_OPTIONS: Array<{ value: TerminationType; label: string }> = [
  { value: "EMPLOYER_TERMINATION", label: "Ä°ÅŸveren feshi" },
  { value: "EMPLOYEE_RESIGNATION", label: "Ä°stifa" },
  { value: "JUST_CAUSE_EMPLOYEE", label: "Ä°ÅŸÃ§i haklÄ± fesih" },
  { value: "MUTUAL_AGREEMENT", label: "KarÅŸÄ±lÄ±klÄ± anlaÅŸma (ikale)" }
];

const GENEL_HATA = "Ä°ÅŸlem gerÃ§ekleÅŸtirilemedi, lÃ¼tfen tekrar deneyin.";
const MARKA_METNI = "AYFSOFT PTE & YUSUF AVÅAR TÃ¼m HaklarÄ± SaklÄ±dÄ±r";
const HUKUK_UYARI_METNI =
  "Bu uygulamadaki bilgiler ve hesaplamalar bilgilendirme amaÃ§lÄ±dÄ±r. ResmÃ® hukuki danÄ±ÅŸmanlÄ±k yerine geÃ§mez. Nihai iÅŸlem Ã¶ncesinde yetkili kurum veya hukuk uzmanÄ±ndan destek alÄ±nmalÄ±dÄ±r.";
const MEAL_TRANSPORT_METHOD_OPTIONS: Array<{ value: "WORKED_ONLY" | "WORKED_AND_ANNUAL" | "PAYABLE_ALL"; label: string }> = [
  { value: "WORKED_ONLY", label: "Sadece fiili Ã§alÄ±ÅŸÄ±lan gÃ¼nler" },
  { value: "WORKED_AND_ANNUAL", label: "Ã‡alÄ±ÅŸÄ±lan + yÄ±llÄ±k izin" },
  { value: "PAYABLE_ALL", label: "TÃ¼m Ã¶denebilir gÃ¼nler" }
];
const LETTER_TEMPLATE_OPTIONS: Array<{ value: ResignationTemplateKey; label: string }> = [
  { value: "STANDARD", label: "1. Standart istifa dilekÃ§esi" },
  { value: "NOTICE_WITH", label: "2. Ä°hbar sÃ¼reli istifa dilekÃ§esi" },
  { value: "NOTICE_WITHOUT", label: "3. Ä°hbar sÃ¼resiz istifa dilekÃ§esi" },
  { value: "PROBATION", label: "4. Deneme sÃ¼resinde istifa dilekÃ§esi" },
  { value: "RETIREMENT", label: "5. Emeklilik nedeniyle ayrÄ±lÄ±ÅŸ dilekÃ§esi" },
  { value: "MILITARY", label: "6. Askerlik nedeniyle ayrÄ±lÄ±ÅŸ dilekÃ§esi" },
  { value: "MARRIAGE", label: "7. Evlilik nedeniyle ayrÄ±lÄ±ÅŸ dilekÃ§esi" },
  { value: "HEALTH", label: "8. SaÄŸlÄ±k nedeniyle haklÄ± fesih dilekÃ§esi" },
  { value: "SALARY_UNPAID", label: "9. MaaÅŸ Ã¶denmemesi nedeniyle haklÄ± fesih dilekÃ§esi" },
  { value: "OVERTIME_UNPAID", label: "10. Fazla mesai Ã¶denmemesi nedeniyle haklÄ± fesih dilekÃ§esi" },
  { value: "MOBBING", label: "11. Mobbing nedeniyle haklÄ± fesih dilekÃ§esi" },
  { value: "WORK_CONDITION_CHANGE", label: "12. Ä°ÅŸ ÅŸartlarÄ±nÄ±n esaslÄ± deÄŸiÅŸmesi nedeniyle fesih dilekÃ§esi" },
  { value: "OHS_VIOLATION", label: "13. Ä°SG ihlali nedeniyle haklÄ± fesih dilekÃ§esi" },
  { value: "SGK_PREMIUM_MISSING", label: "14. SGK primi eksik yatÄ±rÄ±lmasÄ± nedeniyle haklÄ± fesih dilekÃ§esi" },
  { value: "ANNUAL_LEAVE_DENIED", label: "15. YÄ±llÄ±k izin kullandÄ±rÄ±lmamasÄ± nedeniyle baÅŸvuru/fesih dilekÃ§esi" }
];

const LEGAL_SECTIONS: Array<{ id: string; title: string; content: string }> = [
  {
    id: "kvkk",
    title: "KVKK AydÄ±nlatma Metni",
    content:
      "AYFSOFT, puantaj ve maaÅŸ hesaplama hizmetini sunarken kimlik bilgileri, Ã§alÄ±ÅŸma kayÄ±tlarÄ±, izin/mesai verileri ve oturum gÃ¼venliÄŸi kayÄ±tlarÄ±nÄ± veri minimizasyonu ilkesiyle iÅŸler. Ä°ÅŸleme amacÄ±; hizmetin sunulmasÄ±, mevzuat yÃ¼kÃ¼mlÃ¼lÃ¼klerinin yerine getirilmesi, bilgi gÃ¼venliÄŸinin saÄŸlanmasÄ± ve kullanÄ±cÄ± taleplerinin yÃ¶netimidir. Veriler yalnÄ±zca yetkili kiÅŸilerce eriÅŸilebilir ÅŸekilde saklanÄ±r; saklama sÃ¼resi dolan veya iÅŸleme amacÄ± ortadan kalkan veriler silinir, yok edilir veya anonim hale getirilir. KullanÄ±cÄ±, KVKK 11. madde kapsamÄ±ndaki tÃ¼m haklarÄ±nÄ± kullanabilir."
  },
  {
    id: "acik-riza",
    title: "AÃ§Ä±k RÄ±za Metni",
    content:
      "KullanÄ±cÄ±; uygulamada yer alan kiÅŸisel veri iÅŸleme sÃ¼reÃ§leri, cihaz verisi kullanÄ±mÄ±, gÃ¼venlik kayÄ±tlarÄ± ve hukuki bilgilendirme metinleri hakkÄ±nda aydÄ±nlatÄ±ldÄ±ÄŸÄ±nÄ± kabul eder. AÃ§Ä±k rÄ±za, Ã¶zgÃ¼r iradeyle ve bilgilendirmeye dayalÄ± olarak verilir; kullanÄ±cÄ± dilediÄŸi zaman ilgili baÅŸvuru kanallarÄ± Ã¼zerinden rÄ±zasÄ±nÄ± geri Ã§ekebilir. RÄ±zanÄ±n geri Ã§ekilmesi, geri Ã§ekme tarihine kadar yapÄ±lan iÅŸlemleri hukuka aykÄ±rÄ± hale getirmez."
  },
  {
    id: "gizlilik",
    title: "Gizlilik PolitikasÄ±",
    content:
      "Uygulama verileri yetkisiz eriÅŸim, ifÅŸa, deÄŸiÅŸtirme ve kayba karÅŸÄ± teknik ve idari tedbirlerle korunur. Kimlik doÄŸrulama, oturum yÃ¶netimi, oran sÄ±nÄ±rlama, eriÅŸim denetimi ve kayÄ±t mekanizmalarÄ± gÃ¼venlik Ã§erÃ§evesinin parÃ§asÄ±dÄ±r. KullanÄ±cÄ± verileri ticari amaÃ§la Ã¼Ã§Ã¼ncÃ¼ taraflara satÄ±lmaz. Yasal zorunluluk veya resmi merci talebi dÄ±ÅŸÄ±nda paylaÅŸÄ±m yapÄ±lmaz."
  },
  {
    id: "cerez",
    title: "Ã‡erez PolitikasÄ±",
    content:
      "Uygulama, oturum sÃ¼rekliliÄŸi ve gÃ¼venlik iÃ§in teknik Ã§erez benzeri iÅŸaretleyiciler kullanabilir. Bu bileÅŸenler reklam amaÃ§lÄ± deÄŸil, yalnÄ±zca hizmetin gÃ¼venli Ã§alÄ±ÅŸmasÄ± ve kullanÄ±cÄ± deneyiminin sÃ¼rdÃ¼rÃ¼lebilmesi iÃ§in kullanÄ±lÄ±r. Zorunlu olmayan kullanÄ±m senaryolarÄ± devreye alÄ±nÄ±rsa kullanÄ±cÄ± ayrÄ±ca bilgilendirilir."
  },
  {
    id: "cihaz",
    title: "Cihaz Verisi PolitikasÄ±",
    content:
      "Cihaz modeli, iÅŸletim sistemi sÃ¼rÃ¼mÃ¼, uygulama sÃ¼rÃ¼mÃ¼ ve gÃ¼venlik sinyalleri (Ã¶r. emÃ¼latÃ¶r/gerÃ§ek cihaz bilgisi) yalnÄ±zca gÃ¼venlik, hata teÅŸhisi ve hizmet kalitesi amaÃ§larÄ±yla iÅŸlenir. Bu veriler, kullanÄ±cÄ±yÄ± teknik risklerden korumak ve hizmet sÃ¼rekliliÄŸini saÄŸlamak iÃ§in kullanÄ±lÄ±r."
  },
  {
    id: "kullanim-sartlari",
    title: "KullanÄ±m ÅartlarÄ±",
    content:
      "Uygulama Ã§Ä±ktÄ±larÄ± bilgilendirme ve takip amaÃ§lÄ±dÄ±r. ResmÃ® bordro, iÅŸ sÃ¶zleÅŸmesi, ÅŸirket iÃ§i kayÄ±tlar ve ilgili mevzuat Ã¶nceliklidir. KullanÄ±cÄ±, girdiÄŸi bilgilerin doÄŸruluÄŸundan sorumludur. Uygulama verilerinin eksik veya hatalÄ± girilmesi halinde oluÅŸabilecek sonuÃ§lardan kullanÄ±cÄ± sorumludur."
  },
  {
    id: "yasal-sorumluluk",
    title: "Yasal Sorumluluk Reddi",
    content:
      "Uygulamadaki hesaplamalar genel formÃ¼ller Ã¼zerinden yapÄ±lÄ±r ve her iÅŸyeri sÃ¶zleÅŸme ÅŸartÄ± iÃ§in bire bir sonuÃ§ garantisi vermez. Ä°ÅŸ hukuku uyuÅŸmazlÄ±klarÄ±nda avukat, mali mÃ¼ÅŸavir veya yetkili kurum gÃ¶rÃ¼ÅŸÃ¼ esas alÄ±nmalÄ±dÄ±r. Uygulama hiÃ§bir durumda resmÃ® hukuki mÃ¼talaa yerine geÃ§mez."
  },
  {
    id: "veri-saklama",
    title: "Veri Saklama",
    content:
      "KiÅŸisel veriler iÅŸleme amacÄ± ve yasal saklama sÃ¼releri boyunca tutulur. SÃ¼re sonunda veriler gÃ¼venli ÅŸekilde imha edilir veya anonim hale getirilir. Yedekleme, bÃ¼tÃ¼nlÃ¼k kontrolÃ¼ ve eriÅŸim kayÄ±tlarÄ± dÃ¼zenli gÃ¼venlik kontrolleriyle yÃ¶netilir."
  },
  {
    id: "veri-silme",
    title: "Veri Silme",
    content:
      "KullanÄ±cÄ±, hesabÄ± veya verileri iÃ§in silme talebi iletebilir. Talep mevzuata uygun olarak deÄŸerlendirilir; saklama zorunluluÄŸu bulunmayan veriler silinir. Silme iÅŸlemi tamamlandÄ±ÄŸÄ±nda kullanÄ±cÄ±ya bilgilendirme yapÄ±lÄ±r."
  },
  {
    id: "kullanici-haklari",
    title: "KullanÄ±cÄ± HaklarÄ±",
    content:
      "KullanÄ±cÄ±; veriye eriÅŸim, dÃ¼zeltme, silme, iÅŸleme kÄ±sÄ±tlama, itiraz, taÅŸÄ±nabilirlik ve bilgi talebi haklarÄ±nÄ± kullanabilir. BaÅŸvurular kimlik doÄŸrulamasÄ± sonrasÄ± makul sÃ¼rede cevaplanÄ±r. UyuÅŸmazlÄ±k halinde ilgili denetim kurumlarÄ±na baÅŸvuru hakkÄ± saklÄ±dÄ±r."
  },
  {
    id: "is-hukuku",
    title: "Ä°ÅŸ Hukuku Bilgilendirmesi",
    content:
      "Puantaj, fazla mesai, hafta tatili ve UBGT deÄŸerlendirmesi yapÄ±lÄ±rken iÅŸ sÃ¶zleÅŸmesi, toplu iÅŸ sÃ¶zleÅŸmesi, ÅŸirket iÃ§ dÃ¼zenlemeleri ve gÃ¼ncel mevzuat birlikte yorumlanmalÄ±dÄ±r. Bu uygulama yalnÄ±zca bilgilendirme amacÄ±yla hesap Ã¼retir; resmÃ® bordro, iÅŸveren kayÄ±tlarÄ± ve yetkili kurum kararlarÄ± esastÄ±r."
  },
  {
    id: "kidem",
    title: "KÄ±dem TazminatÄ± Bilgilendirmesi",
    content:
      "KÄ±dem tazminatÄ± deÄŸerlendirmesi 1475 sayÄ±lÄ± Kanun m.14 esas alÄ±narak hizmet sÃ¼resi, brÃ¼t Ã¼cret, dÃ¼zenli yan haklar ve gÃ¼ncel kÄ±dem tavanÄ± dikkate alÄ±narak yapÄ±lÄ±r. Hesaplama sonucu tahmin niteliÄŸindedir; nihai Ã¶deme iÅŸveren bordrosu, SGK kayÄ±tlarÄ± ve hukuki inceleme ile kesinleÅŸir."
  },
  {
    id: "ihbar",
    title: "Ä°hbar TazminatÄ± Bilgilendirmesi",
    content:
      "Ä°hbar sÃ¼releri 4857 sayÄ±lÄ± Ä°ÅŸ Kanunu m.17 kapsamÄ±nda hesaplanÄ±r: 6 aydan az 2 hafta (14 gÃ¼n), 6 ay-1.5 yÄ±l 4 hafta (28 gÃ¼n), 1.5 yÄ±l-3 yÄ±l 6 hafta (42 gÃ¼n), 3 yÄ±ldan fazla 8 hafta (56 gÃ¼n). Uygulama bu sÃ¼reler Ã¼zerinden tahmini ihbar bedeli Ã¼retir."
  },
  {
    id: "istifa",
    title: "Ä°stifa SÃ¼reÃ§leri",
    content:
      "Ä°stifa sÃ¼recinde tarih, gerekÃ§e ve teslim biÃ§imi Ã¶nemlidir. HaklÄ± fesih, askerlik, evlilik, mobbing veya Ã¼cretin Ã¶denmemesi gibi nedenlerde mevzuata uygun belge ve bildirim dÃ¼zeni izlenmelidir. Uygulama, dilekÃ§e taslaklarÄ± sunar; nihai metin somut olaya gÃ¶re uzman desteÄŸiyle kontrol edilmelidir."
  }
];

type AdminPanelStats = {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  recentLogins: Array<{ id: string; username: string; lastLoginAt: string | null; lastIp: string | null }>;
};

type AdminPanelUser = {
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

type AdminPanelUserDetail = {
  user: AdminPanelUser;
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
  devices?: Array<{ id: string; fingerprint: string; deviceInfo: string | null; firstSeenAt: string; lastSeenAt: string; lastIp: string | null }>;
  adminNotes?: Array<{ id: string; adminUserId: string | null; note: string; createdAt: string }>;
};

type AdminPanelIpBan = {
  id: string;
  ipAddress: string;
  reason: string | null;
  createdAt: string;
};

function monthDateRangeText(monthKey: string): string {
  if (!isMonthKey(monthKey)) {
    return "";
  }
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(year, month, 0).getDate();
  return `01.${monthStr}.${year} - ${`${lastDay}`.padStart(2, "0")}.${monthStr}.${year}`;
}

function paidInputFromPayment(payment: MonthPayment): Record<PaymentField, string> {
  return {
    salary: String(payment.salary),
    overtime: String(payment.overtime),
    sunday: String(payment.sunday),
    ubgt: String(payment.ubgt),
    meal: String(payment.meal),
    transport: String(payment.transport)
  };
}

function normalizeDayRecord(record: DayRecord | undefined): DayRecord {
  if (record) {
    return record;
  }
  return {
    dateKey: "",
    status: null,
    isManual: false,
    work: null,
    note: "",
    updatedAt: ""
  };
}

function normalizeIncomingData(data: AppData | null | undefined): AppData {
  if (!data) {
    return DEFAULT_DATA;
  }

  return {
    ...DEFAULT_DATA,
    ...data,
    settings: {
      ...DEFAULT_DATA.settings,
      ...data.settings,
      coefficients: {
        ...DEFAULT_DATA.settings.coefficients,
        ...(data.settings?.coefficients ?? {})
      }
    },
    legal: {
      ...DEFAULT_DATA.legal,
      ...data.legal,
      resignationForm: {
        ...DEFAULT_DATA.legal.resignationForm,
        ...(data.legal?.resignationForm ?? {})
      }
    },
    profile: {
      ...DEFAULT_DATA.profile,
      ...((data as Partial<AppData>).profile ?? {})
    },
    dayRecords: data.dayRecords ?? {},
    paidByMonth: data.paidByMonth ?? {},
    holidayDates: Array.isArray(data.holidayDates) ? data.holidayDates : DEFAULT_DATA.holidayDates,
    halfHolidayDates: Array.isArray((data as { halfHolidayDates?: unknown }).halfHolidayDates)
      ? ((data as { halfHolidayDates: string[] }).halfHolidayDates ?? DEFAULT_DATA.halfHolidayDates)
      : DEFAULT_DATA.halfHolidayDates,
    closedMonths: data.closedMonths ?? {},
    cloud: {
      ...DEFAULT_DATA.cloud,
      ...(data.cloud ?? {})
    },
    shifts: Array.isArray(data.shifts) ? data.shifts : [],
    activeSession: null
  };
}

function escapeCsvCell(value: string | number): string {
  const text = String(value ?? "");
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function normalizeDateKeyForSort(dateKey: string): number {
  const date = dateKeyToDate(dateKey);
  return date ? date.getTime() : 0;
}

function dateRangeKeys(startKey: string, endKey: string): string[] {
  const startDate = dateKeyToDate(startKey);
  const endDate = dateKeyToDate(endKey);
  if (!startDate || !endDate) {
    return [];
  }

  const startMs = Math.min(startDate.getTime(), endDate.getTime());
  const endMs = Math.max(startDate.getTime(), endDate.getTime());
  const keys: string[] = [];

  for (let current = new Date(startMs); current.getTime() <= endMs; current.setDate(current.getDate() + 1)) {
    const year = current.getFullYear();
    const month = `${current.getMonth() + 1}`.padStart(2, "0");
    const day = `${current.getDate()}`.padStart(2, "0");
    keys.push(`${year}-${month}-${day}`);
  }

  return keys;
}

function shortShiftLabel(start: string, end: string): string {
  const shortStart = start.slice(0, 2);
  const shortEnd = end.slice(0, 2);
  if (shortStart && shortEnd) {
    return `${shortStart}-${shortEnd}`;
  }
  return `${start}-${end}`;
}

function profileInitials(name: string, fallback: string): string {
  const source = name.trim() || fallback.trim();
  if (!source) {
    return "AY";
  }
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [appData, setAppData] = useState<AppData>(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"USER_LOGIN" | "USER_REGISTER">("USER_LOGIN");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSource, setAuthSource] = useState<"REMOTE" | "LOCAL" | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authInviteKey, setAuthInviteKey] = useState("");
  const [consentKvkk, setConsentKvkk] = useState(false);
  const [consentAcikRiza, setConsentAcikRiza] = useState(false);
  const [consentGizlilik, setConsentGizlilik] = useState(false);
  const [consentCerez, setConsentCerez] = useState(false);
  const [consentCihazVerisi, setConsentCihazVerisi] = useState(false);
  const [consentYasalSorumluluk, setConsentYasalSorumluluk] = useState(false);
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [openLegalSectionMap, setOpenLegalSectionMap] = useState<Record<string, boolean>>({});
  const [selectedLetterTemplate, setSelectedLetterTemplate] = useState<ResignationTemplateKey>("STANDARD");
  const [adminUsers, setAdminUsers] = useState<AdminPanelUser[]>([]);
  const [adminStats, setAdminStats] = useState<AdminPanelStats | null>(null);
  const [adminSelectedUser, setAdminSelectedUser] = useState<AdminPanelUserDetail | null>(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminBanReason, setAdminBanReason] = useState("Politika ihlali");
  const [adminBanDurationHours, setAdminBanDurationHours] = useState("");
  const [adminNoteInput, setAdminNoteInput] = useState("");
  const [adminIpBans, setAdminIpBans] = useState<AdminPanelIpBan[]>([]);
  const [adminIpInput, setAdminIpInput] = useState("");
  const [adminIpReason, setAdminIpReason] = useState("GÃ¼venlik ihlali");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState("");

  const [activeTab, setActiveTab] = useState<Tab>("CALENDAR");
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [dayEditStart, setDayEditStart] = useState("");
  const [dayEditEnd, setDayEditEnd] = useState("");
  const [dayEditTotalHours, setDayEditTotalHours] = useState("");
  const [dayEditBreakMinutes, setDayEditBreakMinutes] = useState("");
  const [dayEditManualOvertime, setDayEditManualOvertime] = useState("");
  const [dayEditNote, setDayEditNote] = useState("");
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [bulkStartDateKey, setBulkStartDateKey] = useState<string | null>(null);
  const [bulkEndDateKey, setBulkEndDateKey] = useState<string | null>(null);
  const [supportSubject, setSupportSubject] = useState("Destek Talebi");
  const [supportMessage, setSupportMessage] = useState("");

  const [holidayInput, setHolidayInput] = useState("");
  const [paymentInputs, setPaymentInputs] = useState<Record<PaymentField, string>>(
    paidInputFromPayment({ salary: 0, overtime: 0, sunday: 0, ubgt: 0, meal: 0, transport: 0 })
  );
  const saveDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequenceRef = useRef(0);
  const usernameInputRef = useRef<TextInput | null>(null);
  const passwordInputRef = useRef<TextInput | null>(null);
  const inviteKeyInputRef = useRef<TextInput | null>(null);

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const effectiveDarkMode = true;

  useEffect(() => {
    let mounted = true;
    const loadGuardTimer = setTimeout(() => {
      if (mounted) {
        setLoaded(true);
      }
    }, 15000);

    const bootstrap = async () => {
      await ensureDefaultSecurity().catch(() => {});

      const backendOk = await pingBackend().catch(() => false);
      if (mounted) {
        setBackendConnected(backendOk);
      }

      const remoteSession = backendOk ? await remoteMe().catch(() => null) : null;
      if (remoteSession) {
        const localData = await loadAppData(remoteSession.id);
        let mergedData = normalizeIncomingData(localData);

        try {
          const remoteData = await pullPayrollFromBackend();
          if (remoteData) {
            mergedData = normalizeIncomingData(remoteData);
          } else {
            await pushPayrollToBackend(localData);
          }
        } catch {
          // Keep local data when backend sync is unavailable.
        }

        if (!mounted) {
          return;
        }

        setAuthUser(remoteSession);
        setAuthSource("REMOTE");
        setAppData(mergedData);
        setLoaded(true);
        return;
      }

      const localSession = await loadLocalSession().catch(() => null);
      if (!localSession) {
        if (mounted) {
          setLoaded(true);
        }
        return;
      }

      const localData = await loadAppData(localSession.id);
      if (!mounted) {
        return;
      }

      setAuthUser(localSession);
      setAuthSource("LOCAL");
      setAppData(normalizeIncomingData(localData));
      setLoaded(true);
    };

    bootstrap().catch(() => {
      if (mounted) {
        setLoaded(true);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(loadGuardTimer);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    NavigationBar.setBackgroundColorAsync("#050816").catch(() => {});
    NavigationBar.setButtonStyleAsync("light").catch(() => {});
  }, []);

  useEffect(() => {
    if (!loaded || !authUser) {
      return;
    }

    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
      saveDebounceTimerRef.current = null;
    }

    setSaving(true);
    const currentSequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = currentSequence;

    saveDebounceTimerRef.current = setTimeout(() => {
      saveDebounceTimerRef.current = null;
      const persist = async () => {
        await saveAppData(appData, authUser.id);
        if (authSource === "REMOTE") {
          try {
            await pushPayrollToBackend(appData);
            setBackendConnected(true);
          } catch {
            setBackendConnected(false);
          }
        }
      };

      persist()
        .catch(() => {})
        .finally(() => {
          if (saveSequenceRef.current === currentSequence) {
            setSaving(false);
          }
        });
    }, 450);

    return () => {
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
        saveDebounceTimerRef.current = null;
      }
    };
  }, [appData, authSource, authUser, loaded]);

  const summary = useMemo(() => {
    return calculateMonthlySummary(
      appData.dayRecords,
      appData.settings,
      appData.paidByMonth,
      monthKey,
      appData.holidayDates,
      appData.halfHolidayDates
    );
  }, [appData.dayRecords, appData.halfHolidayDates, appData.holidayDates, appData.paidByMonth, appData.settings, monthKey]);

  useEffect(() => {
    setPaymentInputs(paidInputFromPayment(summary.paid));
  }, [monthKey, summary.paid]);

  const monthGrid = useMemo(() => buildMonthGrid(monthKey), [monthKey]);
  const totalDifference = useMemo(() => totalDifferenceForAllMonths(appData), [appData]);
  const legalResult = useMemo(() => calculateLegalResult(appData.legal), [appData.legal]);
  const analytics = useMemo(() => {
    return calculateMonthlyAnalytics(appData.dayRecords, appData.settings, monthKey, appData.holidayDates, summary);
  }, [appData.dayRecords, appData.holidayDates, appData.settings, monthKey, summary]);
  const periodText =
    summary.salaryPeriodStart && summary.salaryPeriodDisplayEnd
      ? `${formatDateKeyTr(summary.salaryPeriodStart)} - ${formatDateKeyTr(summary.salaryPeriodDisplayEnd)}`
      : "-";
  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
  }, []);
  const legalDateFormatWarning =
    appData.legal.hireDate && !isTrDate(appData.legal.hireDate)
      ? "Ä°ÅŸe giriÅŸ tarihi 01.01.2025 formatÄ±nda olmalÄ±dÄ±r."
      : appData.legal.terminationDate && !isTrDate(appData.legal.terminationDate)
        ? "Ä°ÅŸten Ã§Ä±kÄ±ÅŸ tarihi 01.01.2026 formatÄ±nda olmalÄ±dÄ±r."
        : "";
  const generatedDraft = buildResignationDraft({
    template: selectedLetterTemplate,
    fullName: appData.legal.resignationForm.fullName || authUser?.username || "",
    tcNo: appData.legal.resignationForm.tcNo,
    workplaceTitle: appData.legal.resignationForm.workplaceTitle,
    department: appData.legal.resignationForm.department,
    phone: appData.legal.resignationForm.phone,
    hireDate: appData.legal.resignationForm.hireDate || appData.legal.hireDate || "",
    leaveDate: appData.legal.resignationForm.leaveDate || appData.legal.terminationDate || "",
    letterDate: appData.legal.resignationForm.letterDate || "",
    address: appData.legal.resignationForm.address,
    explanation: appData.legal.resignationForm.explanation
  });
  const effectiveDraft = appData.legal.resignationForm.customDraft.trim() || generatedDraft;

  const isMonthClosed = !!appData.closedMonths[monthKey];

  const calendarPadding = 12;
  const contentWidth = Math.max(238, width - 24 - calendarPadding * 2);
  const dayCellWidth = Math.max(34, Math.floor(contentWidth / 7));
  const dayCellHeight = Math.max(50, Math.floor(dayCellWidth * 0.86));

  const selectedDayRecord = selectedDateKey ? normalizeDayRecord(appData.dayRecords[selectedDateKey]) : null;
  const selectedDayType = selectedDateKey ? dayTypeOf(selectedDateKey, appData.holidayDates, appData.halfHolidayDates) : "NORMAL";
  const selectedAutoDailyOvertime =
    selectedDayRecord?.status === "WORKED"
      ? calculateDailyOvertimeHours(
          selectedDayRecord.work?.totalHours ?? appData.settings.defaultShiftHours,
          appData.settings,
          selectedDayRecord.work?.manualOvertimeOverrideHours
        )
      : 0;
  const selectedYearPrefix = `${monthKey.slice(0, 4)}-`;
  const visibleHolidayDates = appData.holidayDates.filter((item) => item.startsWith(selectedYearPrefix));
  const bulkRangeDateKeys =
    bulkStartDateKey && bulkEndDateKey ? dateRangeKeys(bulkStartDateKey, bulkEndDateKey) : bulkStartDateKey ? [bulkStartDateKey] : [];
  const bulkRangeSet = useMemo(() => new Set(bulkRangeDateKeys), [bulkRangeDateKeys]);

  useEffect(() => {
    if (!statusModalVisible || !selectedDateKey) {
      return;
    }
    const record = normalizeDayRecord(appData.dayRecords[selectedDateKey]);
    setDayEditStart(record.work?.start ?? appData.settings.defaultShiftStart);
    setDayEditEnd(record.work?.end ?? appData.settings.defaultShiftEnd);
    setDayEditTotalHours(String(record.work?.totalHours ?? appData.settings.defaultShiftHours));
    setDayEditBreakMinutes(String(record.work?.breakMinutes ?? 0));
    setDayEditManualOvertime(
      record.work?.manualOvertimeOverrideHours === undefined ? "" : String(record.work.manualOvertimeOverrideHours)
    );
    setDayEditNote(record.note ?? "");
  }, [appData.dayRecords, appData.settings.defaultShiftEnd, appData.settings.defaultShiftHours, appData.settings.defaultShiftStart, selectedDateKey, statusModalVisible]);

  const updateMonthPaymentInput = (field: PaymentField, value: string) => {
    setPaymentInputs((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const saveMonthPayment = () => {
    if (!isMonthKey(monthKey)) {
      Alert.alert("Ay formatÄ± hatalÄ±", "Ay bilgisi YYYY-MM olmalÄ±.");
      return;
    }
    if (isMonthClosed) {
      Alert.alert("Ay kapalÄ±", "Bu ay kapalÄ± olduÄŸu iÃ§in Ã¶deme deÄŸiÅŸtirilemez.");
      return;
    }

    const payment: MonthPayment = {
      salary: safePositive(tryParseNumber(paymentInputs.salary)),
      overtime: safePositive(tryParseNumber(paymentInputs.overtime)),
      sunday: safePositive(tryParseNumber(paymentInputs.sunday)),
      ubgt: safePositive(tryParseNumber(paymentInputs.ubgt)),
      meal: safePositive(tryParseNumber(paymentInputs.meal)),
      transport: safePositive(tryParseNumber(paymentInputs.transport))
    };

    setAppData((prev) => ({
      ...prev,
      paidByMonth: {
        ...prev.paidByMonth,
        [monthKey]: payment
      }
    }));
  };

  const applyDayStatusToDates = (dateKeys: string[], status: DayStatus | null) => {
    if (dateKeys.length === 0) {
      return;
    }
    if (isMonthClosed) {
      Alert.alert("Ay kapalÄ±", "Bu ay kapalÄ± olduÄŸu iÃ§in deÄŸiÅŸiklik yapÄ±lamaz.");
      return;
    }

    setAppData((prev) => {
      const nextRecords = { ...prev.dayRecords };
      for (const dateKey of dateKeys) {
        if (status === null) {
          nextRecords[dateKey] = {
            dateKey,
            status: null,
            isManual: true,
            work: null,
            note: "",
            updatedAt: new Date().toISOString()
          };
        } else if (status === "WORKED") {
          nextRecords[dateKey] = createWorkedRecord(dateKey, prev.settings, true);
        } else {
          nextRecords[dateKey] = createStatusRecord(dateKey, status, true);
        }
      }

      return {
        ...prev,
        dayRecords: nextRecords
      };
    });
  };

  const updateDayStatus = (status: DayStatus | null) => {
    if (!selectedDateKey) {
      return;
    }
    applyDayStatusToDates([selectedDateKey], status);
    if (status !== "WORKED") {
      setStatusModalVisible(false);
    }
  };

  const saveSelectedDayDetail = () => {
    if (!selectedDateKey || isMonthClosed) {
      return;
    }
    if (!/^\d{1,2}:\d{2}$/.test(dayEditStart) || !/^\d{1,2}:\d{2}$/.test(dayEditEnd)) {
      Alert.alert("Saat hatalÄ±", "BaÅŸlangÄ±Ã§ ve bitiÅŸ 20:00 formatÄ±nda olmalÄ±.");
      return;
    }
    const totalHours = safePositive(tryParseNumber(dayEditTotalHours));
    const breakMinutes = safePositive(tryParseNumber(dayEditBreakMinutes));
    const manualOverride = dayEditManualOvertime.trim()
      ? safePositive(tryParseNumber(dayEditManualOvertime))
      : undefined;

    setAppData((prev) => ({
      ...prev,
      dayRecords: {
        ...prev.dayRecords,
        [selectedDateKey]: {
          dateKey: selectedDateKey,
          status: "WORKED",
          isManual: true,
          work: {
            start: dayEditStart,
            end: dayEditEnd,
            totalHours,
            breakMinutes,
            manualOvertimeOverrideHours: manualOverride
          },
          note: dayEditNote,
          updatedAt: new Date().toISOString()
        }
      }
    }));
    setStatusModalVisible(false);
  };

  const applyBulkDayStatus = (status: DayStatus | null) => {
    if (bulkRangeDateKeys.length === 0) {
      Alert.alert("Toplu iÅŸlem", "Ã–nce takvimden bir aralÄ±k seÃ§in.");
      return;
    }
    const nextStatusText = dayStatusLabel(status);
    Alert.alert(
      "Toplu iÅŸlem onayÄ±",
      `${bulkRangeDateKeys.length} gÃ¼ne '${nextStatusText}' durumu uygulanacak. Devam edilsin mi?`,
      [
        { text: "VazgeÃ§", style: "cancel" },
        {
          text: "Uygula",
          onPress: () => applyDayStatusToDates(bulkRangeDateKeys, status)
        }
      ]
    );
  };

  const toggleBulkMode = () => {
    setBulkSelectMode((prev) => !prev);
    setBulkStartDateKey(null);
    setBulkEndDateKey(null);
  };

  const setBulkSelectionDate = (dateKey: string) => {
    if (!bulkStartDateKey || (bulkStartDateKey && bulkEndDateKey)) {
      setBulkStartDateKey(dateKey);
      setBulkEndDateKey(null);
      return;
    }
    if (normalizeDateKeyForSort(dateKey) < normalizeDateKeyForSort(bulkStartDateKey)) {
      setBulkEndDateKey(bulkStartDateKey);
      setBulkStartDateKey(dateKey);
      return;
    }
    setBulkEndDateKey(dateKey);
  };

  const addHolidayDate = () => {
    const dateKey = holidayInput.trim();
    if (!isIsoDate(dateKey)) {
      Alert.alert("Tarih hatalÄ±", "Tarih YYYY-MM-DD formatÄ±nda olmalÄ±dÄ±r.");
      return;
    }

    setAppData((prev) => ({
      ...prev,
      holidayDates: [...new Set([...prev.holidayDates, dateKey])].sort()
    }));
    setHolidayInput("");
  };

  const removeHolidayDate = (dateKey: string) => {
    setAppData((prev) => ({
      ...prev,
      holidayDates: prev.holidayDates.filter((item) => item !== dateKey)
    }));
  };

  const setNumericSetting = (key: NumericSettingKey, raw: string) => {
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        [key]: safePositive(tryParseNumber(raw))
      }
    }));
  };

  const setCoefficient = (key: "overtime" | "sunday" | "holiday", raw: string) => {
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        coefficients: {
          ...prev.settings.coefficients,
          [key]: safePositive(tryParseNumber(raw))
        }
      }
    }));
  };

  const setStringSetting = (key: "defaultShiftStart" | "defaultShiftEnd", value: string) => {
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        [key]: value
      }
    }));
  };

  const setLegalField = (key: keyof LegalSettings, value: string) => {
    setAppData((prev) => {
      if (key === "hireDate" || key === "terminationDate") {
        return {
          ...prev,
          legal: {
            ...prev.legal,
            [key]: maskTrDateInput(value)
          }
        };
      }
      if (key === "terminationType") {
        return {
          ...prev,
          legal: {
            ...prev.legal,
            terminationType: value as TerminationType
          }
        };
      }

      const numericValue = safePositive(tryParseNumber(value));
      return {
        ...prev,
        legal: {
          ...prev.legal,
          [key]: numericValue
        }
      };
    });
  };

  const setResignationField = (
    key:
      | "fullName"
      | "tcNo"
      | "workplaceTitle"
      | "department"
      | "phone"
      | "hireDate"
      | "leaveDate"
      | "letterDate"
      | "address"
      | "explanation"
      | "customDraft",
    value: string
  ) => {
    setAppData((prev) => ({
      ...prev,
      legal: {
        ...prev.legal,
        resignationForm: {
          ...prev.legal.resignationForm,
          [key]:
            key === "hireDate" || key === "leaveDate" || key === "letterDate"
              ? maskTrDateInput(value)
              : value
        }
      }
    }));
  };

  const setProfileField = (key: "fullName" | "phone" | "email" | "address" | "avatarUrl", value: string) => {
    setAppData((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        [key]: value
      }
    }));
  };

  const pickProfileImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Ä°zin gerekli", "Galeriden profil fotoÄŸrafÄ± seÃ§mek iÃ§in fotoÄŸraf izni vermelisiniz.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      const sourceUri = result.assets[0].uri;
      const extension = sourceUri.split(".").pop()?.split("?")[0] || "jpg";
      const targetUri = `${FileSystem.documentDirectory}profile-${authUser?.id ?? "user"}.${extension}`;
      await FileSystem.copyAsync({ from: sourceUri, to: targetUri }).catch(() => {});
      const previousUri = appData.profile.avatarUrl.trim();
      if (previousUri && previousUri.startsWith(FileSystem.documentDirectory ?? "") && previousUri !== targetUri) {
        await FileSystem.deleteAsync(previousUri, { idempotent: true }).catch(() => {});
      }
      setProfileField("avatarUrl", targetUri);
    } catch {
      Alert.alert("FotoÄŸraf", "FotoÄŸraf seÃ§ilemedi. LÃ¼tfen tekrar deneyin.");
    }
  };

  const closeMonth = () => {
    if (!isMonthKey(monthKey)) {
      Alert.alert("Ay formatÄ± hatalÄ±", "Ay bilgisi YYYY-MM olmalÄ±.");
      return;
    }

    Alert.alert(
      "Ay kapatma onayÄ±",
      "Bu ay kapatÄ±lacak, kayÄ±tlar deÄŸiÅŸtirilemeyecek. Emin misin?",
      [
        { text: "VazgeÃ§", style: "cancel" },
        {
          text: "AyÄ± Kapat",
          style: "destructive",
          onPress: () => {
            setAppData((prev) => ({
              ...prev,
              closedMonths: {
                ...prev.closedMonths,
                [monthKey]: true
              }
            }));
          }
        }
      ]
    );
  };

  const openMonth = () => {
    setAppData((prev) => {
      const next = { ...prev.closedMonths };
      delete next[monthKey];
      return {
        ...prev,
        closedMonths: next
      };
    });
  };

  const resetSystem = () => {
    Alert.alert("TÃ¼m sistemi sÄ±fÄ±rla", "TÃ¼m kayÄ±tlar silinecek. Devam edilsin mi?", [
      { text: "VazgeÃ§", style: "cancel" },
      {
        text: "SÄ±fÄ±rla",
        style: "destructive",
        onPress: () => {
          setAppData(DEFAULT_DATA);
          setMonthKey(currentMonthKey());
          setActiveTab("CALENDAR");
          setHolidayInput("");
        }
      }
    ]);
  };

  const resetEverything = () => {
    Alert.alert("Yerel verileri sÄ±fÄ±rla", "Bu cihazdaki kayÄ±tlar temizlenecek. Devam edilsin mi?", [
      { text: "VazgeÃ§", style: "cancel" },
      {
        text: "SÄ±fÄ±rla",
        style: "destructive",
        onPress: async () => {
          setAppData(DEFAULT_DATA);
          setMonthKey(currentMonthKey());
          setActiveTab("CALENDAR");
        }
      }
    ]);
  };

  const loadUserWorkspace = async (user: AuthUser, source: "REMOTE" | "LOCAL") => {
    const localData = await loadAppData(user.id);
    let merged = normalizeIncomingData(localData);

    if (source === "REMOTE") {
      try {
        const remoteData = await pullPayrollFromBackend();
        if (remoteData) {
          merged = normalizeIncomingData(remoteData);
        } else {
          await pushPayrollToBackend(localData);
        }
        setBackendConnected(true);
      } catch {
        setBackendConnected(false);
      }
    }

    setAppData(merged);
    setAuthUser(user);
    setAuthSource(source);
    setMonthKey(currentMonthKey());
    setActiveTab("CALENDAR");
  };

  const reportClientSecurity = async () => {
    try {
      await sendSecuritySignal({
        emulator: !Device.isDevice,
        rooted: false,
        debug: __DEV__,
        developerMode: __DEV__,
        details: `platform=${Platform.OS}; model=${Device.modelName ?? "-"}; os=${Device.osName ?? "-"} ${Device.osVersion ?? "-"}`
      });
    } catch {
      // Non-blocking
    }
  };

  const clearAuthError = () => {
    setAuthError("");
  };

  const openDrawer = () => setDrawerVisible(true);
  const closeDrawer = () => setDrawerVisible(false);
  const selectDrawerTab = (tab: Tab) => {
    setActiveTab(tab);
    setDrawerVisible(false);
  };
  const openSupportContact = async () => {
    const email = "yusufavsarsgu@gmail.com";
    const subject = encodeURIComponent(supportSubject.trim() || "Destek Talebi");
    const body = encodeURIComponent(
      [
        supportMessage.trim(),
        "",
        `KullanÄ±cÄ±: ${authUser?.username ?? "-"}`,
        `Platform: ${Platform.OS}`,
        `Cihaz: ${Device.modelName ?? "-"}`
      ]
        .filter(Boolean)
        .join("\n")
    );
    const mailUrl = `mailto:${email}?subject=${subject}&body=${body}`;
    try {
      const canOpen = await Linking.canOpenURL(mailUrl);
      if (!canOpen) {
        Alert.alert("Destek", "Bu cihazda e-posta uygulamasÄ± aÃ§Ä±lamadÄ±.");
        return;
      }
      await Linking.openURL(mailUrl);
    } catch {
      Alert.alert("Destek", "Ä°letiÅŸim ekranÄ± aÃ§Ä±lamadÄ±.");
    }
  };

  const sanitizeUserMessage = (error: unknown, fallback: string): string => {
    if (!(error instanceof Error)) {
      return fallback;
    }
    const text = error.message.trim();
    if (!text) {
      return fallback;
    }
    const lower = text.toLowerCase();
    if (
      lower.includes("api") ||
      lower.includes("token") ||
      lower.includes("backend") ||
      lower.includes("endpoint") ||
      lower.includes("request") ||
      lower.includes("http")
    ) {
      return fallback;
    }
    return text;
  };

  const toggleLegalSection = (sectionId: string) => {
    setOpenLegalSectionMap((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const allRequiredConsentsAccepted =
    consentKvkk &&
    consentAcikRiza &&
    consentGizlilik &&
    consentCerez &&
    consentCihazVerisi &&
    consentYasalSorumluluk;

  const resetConsentForm = () => {
    setConsentKvkk(false);
    setConsentAcikRiza(false);
    setConsentGizlilik(false);
    setConsentCerez(false);
    setConsentCihazVerisi(false);
    setConsentYasalSorumluluk(false);
  };

  const buildConsentPayload = () => ({
    kvkk: consentKvkk,
    acikRiza: consentAcikRiza,
    gizlilik: consentGizlilik,
    cerez: consentCerez,
    cihazVerisi: consentCihazVerisi,
    kullanimSartlari: consentYasalSorumluluk,
    yasalSorumluluk: consentYasalSorumluluk,
    istegeBagliBildirim: false
  });

  const loginLocalWithRoleFallback = async (): Promise<AuthUser> => {
    try {
      return await localLoginUser(authUsername, authPassword, "USER");
    } catch {
      return localLoginUser(authUsername, authPassword, "ADMIN");
    }
  };

  const handleLogin = async () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("KullanÄ±cÄ± adÄ± ve ÅŸifre zorunludur.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    try {
      let user: AuthUser;
      let source: "REMOTE" | "LOCAL" = "REMOTE";

      if (backendConnected) {
        user = await remoteLogin(authUsername, authPassword);
      } else {
        user = await loginLocalWithRoleFallback();
        source = "LOCAL";
      }

      await loadUserWorkspace(user, source);
      await reportClientSecurity();
      setAuthPassword("");
      setAuthInviteKey("");
      if (user.role === "ADMIN") {
        await refreshAdminUsers();
        await refreshAdminStats();
      }
    } catch (error) {
      if (backendConnected) {
        try {
          const localUser = await loginLocalWithRoleFallback();
          await loadUserWorkspace(localUser, "LOCAL");
          await reportClientSecurity();
          setAuthPassword("");
          setAuthInviteKey("");
          if (localUser.role === "ADMIN") {
            await refreshAdminUsers();
            await refreshAdminStats();
          }
          return;
        } catch {
          // Tercih edilen hata, Ã§evrimiÃ§i giriÅŸten dÃ¶ner.
        }
      }
      setAuthError(sanitizeUserMessage(error, "GiriÅŸ yapÄ±lamadÄ±."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegister = async () => {
    if (!authUsername.trim() || !authPassword.trim() || !authInviteKey.trim()) {
      setAuthError("KullanÄ±cÄ± adÄ±, ÅŸifre ve kayÄ±t anahtarÄ± zorunludur.");
      return;
    }

    if (!allRequiredConsentsAccepted) {
      setAuthError("Zorunlu onaylar tamamlanmadan kayÄ±t yapÄ±lamaz.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    try {
      let user: AuthUser;
      let source: "REMOTE" | "LOCAL" = "REMOTE";
      const payload = {
        username: authUsername,
        password: authPassword,
        inviteKey: authInviteKey,
        consents: buildConsentPayload()
      };

      if (backendConnected) {
        user = await remoteRegister(payload);
      } else {
        user = await localRegisterUser(payload);
        source = "LOCAL";
      }

      await loadUserWorkspace(user, source);
      await reportClientSecurity();
      setAuthInviteKey("");
      setAuthPassword("");
      resetConsentForm();
    } catch (error) {
      if (backendConnected) {
        try {
          const localUser = await localRegisterUser({
            username: authUsername,
            password: authPassword,
            inviteKey: authInviteKey,
            consents: buildConsentPayload()
          });
          await loadUserWorkspace(localUser, "LOCAL");
          await reportClientSecurity();
          setAuthInviteKey("");
          setAuthPassword("");
          resetConsentForm();
          return;
        } catch {
          // Tercih edilen hata, Ã§evrimiÃ§i kayÄ±ttan dÃ¶ner.
        }
      }
      setAuthError(sanitizeUserMessage(error, "KayÄ±t iÅŸlemi tamamlanamadÄ±."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    if (authSource === "REMOTE") {
      await remoteLogout().catch(() => {});
    } else {
      await localLogoutUser().catch(() => {});
    }
    setAuthUser(null);
    setAuthSource(null);
    setAuthPassword("");
    setAuthInviteKey("");
    resetConsentForm();
    setAppData(DEFAULT_DATA);
    setAdminUsers([]);
    setAdminStats(null);
    setAdminSelectedUser(null);
    setAdminIpBans([]);
    setAdminIpInput("");
    setAdminIpReason("GÃ¼venlik ihlali");
    setAdminBanDurationHours("");
    setDrawerVisible(false);
  };

  const refreshAdminUsers = async () => {
    try {
      const users = await adminGetUsers(adminSearch);
      setAdminUsers(users);
      setAdminError("");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "KullanÄ±cÄ± listesi alÄ±namadÄ±.");
    }
  };

  const refreshAdminStats = async () => {
    try {
      const stats = await adminGetStats();
      setAdminStats(stats);
      setAdminError("");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Admin istatistikleri alÄ±namadÄ±.");
    }
  };

  const refreshAdminIpBans = async () => {
    try {
      const items = await adminGetIpBans();
      setAdminIpBans(items);
      setAdminError("");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "IP ban listesi alÄ±namadÄ±.");
    }
  };

  const openAdminUserDetail = async (userId: string) => {
    try {
      const detail = await adminGetUserDetail(userId);
      setAdminSelectedUser(detail);
      setAdminError("");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "KullanÄ±cÄ± detayÄ± alÄ±namadÄ±.");
    }
  };

  const runAdminAction = async (action: () => Promise<void>) => {
    setAdminBusy(true);
    try {
      await action();
      if (adminSelectedUser) {
        await openAdminUserDetail(adminSelectedUser.user.id);
      }
      await refreshAdminUsers();
      await refreshAdminStats();
      await refreshAdminIpBans();
    } catch (error) {
      Alert.alert("Hata", error instanceof Error ? error.message : "Admin iÅŸlemi baÅŸarÄ±sÄ±z.");
    } finally {
      setAdminBusy(false);
    }
  };

  useEffect(() => {
    if (!authUser || authUser.role !== "ADMIN" || activeTab !== "USERS") {
      return;
    }

    let mounted = true;
    const loadAdminPanel = async () => {
      try {
        const [stats, users, ipBans] = await Promise.all([
          adminGetStats(),
          adminGetUsers(adminSearch),
          adminGetIpBans()
        ]);
        if (!mounted) {
          return;
        }
        setAdminStats(stats);
        setAdminUsers(users);
        setAdminIpBans(ipBans);
        setAdminError("");
      } catch (error) {
        if (!mounted) {
          return;
        }
        setAdminError(error instanceof Error ? error.message : "Admin panel verisi alÄ±namadÄ±.");
      }
    };

    loadAdminPanel().catch(() => {});
    return () => {
      mounted = false;
    };
  }, [activeTab, authUser]);

  const safeText = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const normalizedDateTag = (value: string, fallback: string): string => {
    if (!value) {
      return fallback;
    }
    return value.replace(/\./g, "-").replace(/[^0-9-]/g, "");
  };

  const sharePdf = async (html: string, dialogTitle: string, fileName: string) => {
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const targetDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
      const targetUri = targetDir ? `${targetDir}${fileName}` : uri;
      if (targetUri && targetUri !== uri) {
        await FileSystem.copyAsync({ from: uri, to: targetUri }).catch(() => {});
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("PDF hazÄ±r", targetUri || uri);
        return;
      }
      await Sharing.shareAsync(targetUri || uri, {
        mimeType: "application/pdf",
        dialogTitle,
        UTI: "com.adobe.pdf"
      });
    } catch {
      Alert.alert("Hata", GENEL_HATA);
    }
  };

  const buildDayRowsForMonth = () => {
    if (!isMonthKey(monthKey)) {
      return [];
    }
    const [yearStr, monthStr] = monthKey.split("-");
    const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
    const rows: Array<{
      dateLabel: string;
      dayType: string;
      status: string;
      workText: string;
      totalHours: string;
      overtimeHours: string;
      benefitEligible: string;
      note: string;
    }> = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${monthKey}-${`${day}`.padStart(2, "0")}`;
      const record = appData.dayRecords[dateKey];
      if (!record || record.status === null) {
        continue;
      }
      const dayType = dayTypeOf(dateKey, appData.holidayDates, appData.halfHolidayDates);
      const workText =
        record.status === "WORKED"
          ? `${record.work?.start ?? appData.settings.defaultShiftStart}-${record.work?.end ?? appData.settings.defaultShiftEnd}`
          : "-";
      const totalHours =
        record.status === "WORKED" ? `${round2(record.work?.totalHours ?? appData.settings.defaultShiftHours)}` : "0";
      const workHours = record.work?.totalHours ?? appData.settings.defaultShiftHours;
      const overtimeHours =
        record.status === "WORKED"
          ? `${calculateDailyOvertimeHours(workHours, appData.settings, record.work?.manualOvertimeOverrideHours)}`
          : "0";
      const benefitEligible = isMealTransportEligible(dateKey, dayType, record.status, appData.halfHolidayDates) ? "Evet" : "HayÄ±r";
      rows.push({
        dateLabel: formatDateKeyTr(dateKey),
        dayType: dayTypeLabel(dayType),
        status: dayStatusLabel(record.status),
        workText,
        totalHours,
        overtimeHours,
        benefitEligible,
        note: record.note || ""
      });
    }
    return rows;
  };

  const downloadPuantajSummaryPdf = async () => {
    if (!isMonthKey(monthKey)) {
      Alert.alert("Ay formatÄ± hatalÄ±", "Ay bilgisi YYYY-MM olmalÄ±.");
      return;
    }

    try {
      const reportRows = buildDayRowsForMonth();
      const csvRows = reportRows.map((row) =>
        [row.dateLabel, row.dayType, row.status, row.workText, row.totalHours, row.overtimeHours, row.benefitEligible, row.note]
          .map(escapeCsvCell)
          .join(";")
      );

      const header = [
        `Ay: ${monthLabelTr(monthKey)} (${monthKey})`,
        `KullanÄ±cÄ±: ${authUser?.username ?? "-"}`,
        `Hesap dÃ¶nemi: ${periodText}`,
        "",
        `MaaÅŸ dÃ¶nem gÃ¼nÃ¼: ${summary.salaryPeriodDays}`,
        `Ã–denebilir gÃ¼n: ${summary.payableDays}`,
        `Fiili Ã§alÄ±ÅŸÄ±lan gÃ¼n: ${summary.workedDays}`,
        `Eksik/Ã¶denmeyen gÃ¼n: ${summary.nonPayableDays}`,
        `MaaÅŸ hak ediÅŸ oranÄ±: %${summary.salaryRatioPercent}`,
        `Toplam Ã§alÄ±ÅŸma saati: ${summary.totalHours}`,
        `Toplam mesai saati: ${summary.overtimeHours}`,
        `Hak edilen maaÅŸ: ${formatCurrency(summary.baseSalary)}`,
        `Rapor kesinti: ${formatCurrency(summary.reportDeduction)}`,
        `Mesai Ã¼creti: ${formatCurrency(summary.overtimePay)}`,
        `Pazar Ã¼creti: ${formatCurrency(summary.sundayPay)}`,
        `UBGT Ã¼creti: ${formatCurrency(summary.ubgtPay)}`,
        `Yemek toplam: ${formatCurrency(summary.mealTotal)}`,
        `Yol toplam: ${formatCurrency(summary.transportTotal)}`,
        `Hak edilen toplam: ${formatCurrency(summary.expectedTotal)}`,
        `YatÄ±rÄ±lan toplam: ${formatCurrency(summary.paidTotal)}`,
        `Fark: ${formatSignedCurrency(summary.difference)}`,
        "",
        "Tarih;GÃ¼n Tipi;Durum;Saat;Toplam Saat;GÃ¼nlÃ¼k Mesai;Yemek/Yol;Not"
      ];

      const content = [...header, ...csvRows].join("\n");
      const html = [
        "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:18px;color:#0f172a;\">",
        "<h1>Puantaj Ã–zeti</h1>",
        "<pre style=\"white-space:pre-wrap;font-family:monospace;\">" + safeText(content) + "</pre>",
        "</body></html>"
      ].join("");
      await sharePdf(html, "Puantaj Ã–zeti PDF", `puantaj-ozeti-${monthKey}.pdf`);
    } catch {
      Alert.alert("Hata", GENEL_HATA);
    }
  };

  const downloadSalarySummaryPdf = async () => {
    const lines = [
      `Ay: ${monthLabelTr(monthKey)} (${monthKey})`,
      `Hesap dÃ¶nemi: ${periodText}`,
      "",
      `MaaÅŸ dÃ¶nem gÃ¼nÃ¼: ${summary.salaryPeriodDays}`,
      `Ã–denebilir gÃ¼n: ${summary.payableDays}`,
      `Fiili Ã§alÄ±ÅŸÄ±lan gÃ¼n: ${summary.workedDays}`,
      `Eksik/Ã¶denmeyen gÃ¼n: ${summary.nonPayableDays}`,
      `MaaÅŸ hak ediÅŸ oranÄ±: %${summary.salaryRatioPercent}`,
      `MaaÅŸ hak ediÅŸi: ${formatCurrency(summary.baseSalary)}`,
      `Mesai hak ediÅŸi: ${formatCurrency(summary.overtimePay)}`,
      `Pazar hak ediÅŸi: ${formatCurrency(summary.sundayPay)}`,
      `UBGT hak ediÅŸi: ${formatCurrency(summary.ubgtPay)}`,
      `Yemek hak ediÅŸi: ${formatCurrency(summary.mealTotal)}`,
      `Yol hak ediÅŸi: ${formatCurrency(summary.transportTotal)}`,
      `Toplam hak ediÅŸ: ${formatCurrency(summary.expectedTotal)}`,
      `YatÄ±rÄ±lan toplam: ${formatCurrency(summary.paidTotal)}`,
      `Eksik/Fazla fark: ${formatSignedCurrency(summary.difference)}`
    ];
    const html = [
      "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:22px;color:#0f172a;\">",
      "<h1>MaaÅŸ Ã–zeti</h1>",
      "<pre style=\"white-space:pre-wrap;font-family:monospace;\">" + safeText(lines.join("\n")) + "</pre>",
      "</body></html>"
    ].join("");
    await sharePdf(html, "MaaÅŸ Ã–zeti PDF", `maas-ozeti-${monthKey}.pdf`);
  };

  const downloadDailyDetailPdf = async () => {
    const reportRows = buildDayRowsForMonth();
    const table = reportRows
      .map(
        (row) =>
          `${row.dateLabel} | ${row.dayType} | ${row.status} | ${row.workText} | Toplam: ${row.totalHours} | Mesai: ${row.overtimeHours}`
      )
      .join("\n");
    const html = [
      "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:22px;color:#0f172a;\">",
      "<h1>GÃ¼n GÃ¼n Detay</h1>",
      "<pre style=\"white-space:pre-wrap;font-family:monospace;\">" + safeText(table || "KayÄ±t bulunamadÄ±.") + "</pre>",
      "</body></html>"
    ].join("");
    await sharePdf(html, "GÃ¼n GÃ¼n Detay PDF", `gun-gun-detay-${monthKey}.pdf`);
  };

  const downloadLegalCalculationPdf = async () => {
    const dateTag = normalizedDateTag(appData.legal.hireDate, monthKey);
    const html = [
      "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:22px;color:#0f172a;line-height:1.6;\">",
      "<h1>KÄ±dem / Ä°hbar Hesaplama Ã–zeti</h1>",
      `<p><strong>Ä°ÅŸe giriÅŸ:</strong> ${safeText(appData.legal.hireDate || "-")}</p>`,
      `<p><strong>Ä°ÅŸten Ã§Ä±kÄ±ÅŸ:</strong> ${safeText(appData.legal.terminationDate || "-")}</p>`,
      `<p><strong>BrÃ¼t Ã¼cret:</strong> ${safeText(formatCurrency(appData.legal.grossSalary))}</p>`,
      `<p><strong>AylÄ±k yemek:</strong> ${safeText(formatCurrency(appData.legal.mealAllowance))}</p>`,
      `<p><strong>AylÄ±k yol:</strong> ${safeText(formatCurrency(appData.legal.transportAllowance))}</p>`,
      `<p><strong>DiÄŸer dÃ¼zenli yan hak:</strong> ${safeText(formatCurrency(appData.legal.otherAllowance))}</p>`,
      `<p><strong>Damga vergisi oranÄ±:</strong> %${safeText(String(appData.legal.stampTaxRate))}</p>`,
      `<p><strong>KÄ±dem tavanÄ±:</strong> ${safeText(formatCurrency(appData.legal.severanceCap))}</p>`,
      `<hr />`,
      `<p><strong>Toplam Ã§alÄ±ÅŸma sÃ¼resi:</strong> ${safeText(legalResult.serviceText)}</p>`,
      `<p><strong>KÄ±dem tazminatÄ± (tahmini):</strong> ${safeText(formatCurrency(legalResult.severancePayNet))}</p>`,
      `<p><strong>Ä°hbar sÃ¼resi:</strong> ${safeText(`${legalResult.noticeWeeks} hafta`)}</p>`,
      `<p><strong>Ä°hbar tazminatÄ± (tahmini):</strong> ${safeText(formatCurrency(legalResult.noticePay))}</p>`,
      `<p><strong>KullanÄ±lmayan izin Ã¼creti (tahmini):</strong> ${safeText(formatCurrency(legalResult.annualLeavePay))}</p>`,
      `<p><strong>Toplam tahmini alacak:</strong> ${safeText(formatCurrency(legalResult.estimatedTotal))}</p>`,
      `<p style="margin-top:18px;font-size:12px;">${safeText(HUKUK_UYARI_METNI)}</p>`,
      "</body></html>"
    ].join("");
    await sharePdf(html, "KÄ±dem / Ä°hbar PDF", `kidem-ihbar-${dateTag}.pdf`);
  };

  const downloadResignationPdf = async () => {
    const dateTag = normalizedDateTag(appData.legal.resignationForm.letterDate, monthKey);
    const draft = effectiveDraft || generatedDraft;

    const html = [
      "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:20px;color:#0f172a;line-height:1.6;white-space:pre-wrap;\">",
      "<h1>Ä°stifa / Fesih DilekÃ§esi</h1>",
      safeText(draft),
      "</body></html>"
    ].join("");

    await sharePdf(html, "Ä°stifa DilekÃ§esi PDF", `istifa-dilekcesi-${dateTag}.pdf`);
  };

  if (!loaded) {
    return (
      <SafeAreaView style={[styles.centered, Platform.OS === "android" ? styles.androidTopInset : null]}>
        <ExpoStatusBar style={effectiveDarkMode ? "light" : "dark"} />
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.helper}>Veriler yÃ¼kleniyor...</Text>
      </SafeAreaView>
    );
  }

  if (!authUser) {
    return (
      <SafeAreaView style={[styles.container, Platform.OS === "android" ? styles.androidTopInset : null]}>
        <ExpoStatusBar style={effectiveDarkMode ? "light" : "dark"} />
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
        >
          <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
            <View style={styles.authHeroCard}>
              <Text style={styles.authBadge}>AYFSOFT</Text>
              <Text style={styles.authTitle}>Puantaj ve MaaÅŸ Takip</Text>
              <Text style={styles.authSubtitle}>
                GÃ¼venli giriÅŸ yap, vardiyalarÄ±nÄ± yÃ¶net, hesaplamalarÄ±nÄ± anlÄ±k takip et.
              </Text>
              <View style={styles.authTrustRow}>
                <View style={styles.authTrustItem}>
                  <Text style={styles.authTrustValue}>45s</Text>
                  <Text style={styles.authTrustLabel}>HaftalÄ±k eÅŸik</Text>
                </View>
                <View style={styles.authTrustItem}>
                  <Text style={styles.authTrustValue}>225s</Text>
                  <Text style={styles.authTrustLabel}>AylÄ±k eÅŸik</Text>
                </View>
                <View style={styles.authTrustItem}>
                  <Text style={styles.authTrustValue}>KVKK</Text>
                  <Text style={styles.authTrustLabel}>GÃ¼venli kayÄ±t</Text>
                </View>
              </View>
              <Pressable style={styles.legalChip} onPress={() => setLegalModalVisible(true)}>
                <Text style={styles.legalChipText}>KVKK, Gizlilik, Ã‡erez, Cihaz Verisi ve Yasal Sorumluluklar</Text>
              </Pressable>
            </View>

            <View style={styles.authFormCard}>
              <View style={styles.authModeRow}>
                <Pressable
                  style={[styles.authModeButton, authMode === "USER_LOGIN" ? styles.authModeButtonActive : null]}
                  onPress={() => setAuthMode("USER_LOGIN")}
                >
                  <Text
                    style={[styles.authModeButtonText, authMode === "USER_LOGIN" ? styles.authModeButtonTextActive : null]}
                  >
                    KullanÄ±cÄ± GiriÅŸi
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.authModeButton, authMode === "USER_REGISTER" ? styles.authModeButtonActive : null]}
                  onPress={() => setAuthMode("USER_REGISTER")}
                >
                  <Text
                    style={[styles.authModeButtonText, authMode === "USER_REGISTER" ? styles.authModeButtonTextActive : null]}
                  >
                    KayÄ±t Ol
                  </Text>
                </Pressable>
              </View>

              {authMode === "USER_REGISTER" ? (
                <>
                  <Text style={styles.label}>KayÄ±t anahtarÄ±</Text>
                  <TextInput
                    ref={inviteKeyInputRef}
                    value={authInviteKey}
                    onChangeText={(value) => {
                      setAuthInviteKey(value);
                      clearAuthError();
                    }}
                    secureTextEntry
                    style={styles.input}
                    placeholder="KayÄ±t anahtarÄ±nÄ± girin"
                    returnKeyType="next"
                    onSubmitEditing={() => usernameInputRef.current?.focus()}
                    blurOnSubmit={false}
                  />
                </>
              ) : null}

              <Text style={styles.label}>KullanÄ±cÄ± adÄ±</Text>
              <TextInput
                ref={usernameInputRef}
                value={authUsername}
                onChangeText={(value) => {
                  setAuthUsername(value);
                  clearAuthError();
                }}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                placeholder="KullanÄ±cÄ± adÄ±nÄ±zÄ± girin"
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                blurOnSubmit={false}
              />

              <Text style={styles.label}>Åifre</Text>
              <TextInput
                ref={passwordInputRef}
                value={authPassword}
                onChangeText={(value) => {
                  setAuthPassword(value);
                  clearAuthError();
                }}
                secureTextEntry
                style={styles.input}
                returnKeyType={authMode === "USER_REGISTER" ? "done" : "go"}
                onSubmitEditing={() => {
                  if (authMode === "USER_REGISTER") {
                    void handleRegister();
                  } else {
                    void handleLogin();
                  }
                }}
                blurOnSubmit
              />

              {authMode === "USER_REGISTER" ? (
                <View style={styles.summaryCard}>
                  <Text style={styles.label}>Zorunlu onaylar</Text>
                  <ConsentCheck
                    checked={consentKvkk}
                    onToggle={() => setConsentKvkk((prev) => !prev)}
                    text="KVKK AydÄ±nlatma Metni'ni okudum ve kabul ediyorum."
                  />
                  <ConsentCheck
                    checked={consentAcikRiza}
                    onToggle={() => setConsentAcikRiza((prev) => !prev)}
                    text="AÃ§Ä±k RÄ±za Metni'ni onaylÄ±yorum."
                  />
                  <ConsentCheck
                    checked={consentGizlilik}
                    onToggle={() => setConsentGizlilik((prev) => !prev)}
                    text="Gizlilik PolitikasÄ±'nÄ± okudum ve kabul ediyorum."
                  />
                  <ConsentCheck
                    checked={consentCerez}
                    onToggle={() => setConsentCerez((prev) => !prev)}
                    text="Ã‡erez PolitikasÄ±'nÄ± kabul ediyorum."
                  />
                  <ConsentCheck
                    checked={consentCihazVerisi}
                    onToggle={() => setConsentCihazVerisi((prev) => !prev)}
                    text="Cihaz Verisi PolitikasÄ±'nÄ± kabul ediyorum."
                  />
                  <ConsentCheck
                    checked={consentYasalSorumluluk}
                    onToggle={() => setConsentYasalSorumluluk((prev) => !prev)}
                    text="Yasal Sorumluluk Reddi ve KullanÄ±m ÅartlarÄ±'nÄ± kabul ediyorum."
                  />
                </View>
              ) : null}

              {authError ? <Text style={styles.error}>{authError}</Text> : null}

              {authMode === "USER_REGISTER" ? (
                <Pressable style={styles.primaryButton} onPress={handleRegister} disabled={authBusy}>
                  <Text style={styles.primaryButtonText}>{authBusy ? "KayÄ±t yapÄ±lÄ±yor..." : "KayÄ±t Ol"}</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.primaryButton} onPress={handleLogin} disabled={authBusy}>
                  <Text style={styles.primaryButtonText}>{authBusy ? "GiriÅŸ yapÄ±lÄ±yor..." : "GiriÅŸ Yap"}</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <Modal visible={legalModalVisible} transparent animationType="slide" onRequestClose={() => setLegalModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxHeight: "90%" }]}>
              <Text style={styles.modalTitle}>Hukuk Bilgilendirme Metinleri</Text>
              <ScrollView>
                {LEGAL_SECTIONS.map((section) => (
                  <View key={section.id} style={styles.legalSectionCard}>
                    <Pressable style={styles.row} onPress={() => toggleLegalSection(section.id)}>
                      <Text style={styles.label}>{section.title}</Text>
                      <Text style={styles.label}>{openLegalSectionMap[section.id] ? "-" : "+"}</Text>
                    </Pressable>
                    {openLegalSectionMap[section.id] ? <Text style={styles.legalNote}>{section.content}</Text> : null}
                  </View>
                ))}
                <Text style={styles.legalWarning}>
                  {HUKUK_UYARI_METNI}
                </Text>
              </ScrollView>
              <Pressable style={styles.secondaryButton} onPress={() => setLegalModalVisible(false)}>
                <Text style={styles.secondaryButtonText}>Kapat</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <View style={[styles.authFooter, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={styles.footerText} numberOfLines={2}>{MARKA_METNI}</Text>
        </View>
      </SafeAreaView>
    );
  }

return (
    <SafeAreaView style={[styles.container, Platform.OS === "android" ? styles.androidTopInset : null]}>
      <ExpoStatusBar style={effectiveDarkMode ? "light" : "dark"} />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable style={styles.menuButton} onPress={openDrawer}>
            <Text style={styles.menuButtonText}>â˜°</Text>
          </Pressable>
          <Text style={styles.title}>Puantaj MaaÅŸ Hesap</Text>
        </View>
        <Text style={styles.subtitle}>Takvim, dÃ¶nem Ã¶zeti ve hukuki bilgilendirme tek ekranda.</Text>
        <View style={styles.headerInfoRow}>
          <Text style={styles.helper}>{authUser.role === "ADMIN" ? "YÃ¶netici" : "KullanÄ±cÄ±"}: {authUser.username}</Text>
        </View>
        <View style={styles.saveTextSlot}>
          <Text style={[styles.saveText, !saving ? styles.saveTextHidden : null]}>Kaydediliyor...</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {activeTab === "CALENDAR" ? (
          <View style={styles.section}>
            <View style={styles.monthHeaderRow}>
              <Pressable style={styles.navCircle} onPress={() => setMonthKey((prev) => prevMonthKey(prev))}>
                <Text style={styles.navCircleText}>{"<"}</Text>
              </Pressable>
              <View style={styles.monthHeaderCenter}>
                <Text style={styles.monthTitle}>{monthLabelTr(monthKey)}</Text>
                <Text style={styles.monthRange}>{monthDateRangeText(monthKey)}</Text>
              </View>
              <Pressable style={styles.navCircle} onPress={() => setMonthKey((prev) => nextMonthKey(prev))}>
                <Text style={styles.navCircleText}>{">"}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.todayButton} onPress={() => setMonthKey(todayKey.slice(0, 7))}>
              <Text style={styles.todayButtonText}>BugÃ¼ne Git</Text>
            </Pressable>

            <View style={styles.calendarLegend}>
              <LegendItem color="#0b3f3a" text="Normal" />
              <LegendItem color="#312e81" text="Pazar" />
              <LegendItem color="#7f1d1d" text="UBGT" />
              <LegendItem color="#92400e" text="Raporlu" />
              <LegendItem color="#1e3a8a" text="Ä°zinli" />
              <LegendItem color="#7c2d12" text="YÄ±llÄ±k" />
              <LegendItem color="#334155" text="Tatil" />
              <LegendItem color="#0f172a" text="BoÅŸ" />
            </View>

            {isMonthClosed ? <Text style={styles.closedBadge}>Bu ay kapalÄ±, deÄŸiÅŸiklik yapÄ±lamaz.</Text> : null}

            <SummaryCard title="Toplu Ä°ÅŸlem">
              <InfoRow label="SeÃ§ili gÃ¼n sayÄ±sÄ±" value={`${bulkRangeDateKeys.length}`} />
              <Pressable style={styles.secondaryButton} onPress={toggleBulkMode}>
                <Text style={styles.secondaryButtonText}>{bulkSelectMode ? "Toplu Ä°ÅŸlemi Kapat" : "Toplu Ä°ÅŸlemi AÃ§"}</Text>
              </Pressable>
              <Text style={styles.helper}>
                {bulkRangeDateKeys.length > 0
                  ? `SeÃ§ili aralÄ±k: ${formatDateKeyTr(bulkRangeDateKeys[0])} - ${formatDateKeyTr(
                      bulkRangeDateKeys[bulkRangeDateKeys.length - 1]
                    )} (${bulkRangeDateKeys.length} gÃ¼n)`
                  : "Takvimde gÃ¼ne uzun basarak aralÄ±k seÃ§."}
              </Text>
              {bulkSelectMode ? (
                <View style={styles.optionWrap}>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("WORKED")}>
                    <Text style={styles.optionButtonText}>Ã‡alÄ±ÅŸtÄ±m</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("LEAVE")}>
                    <Text style={styles.optionButtonText}>Ä°zinli</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("REPORT")}>
                    <Text style={styles.optionButtonText}>Raporlu</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("ANNUAL_LEAVE")}>
                    <Text style={styles.optionButtonText}>YÄ±llÄ±k Ä°zin</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("HOLIDAY_OFF")}>
                    <Text style={styles.optionButtonText}>Tatil</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus(null)}>
                    <Text style={styles.optionButtonText}>Temizle</Text>
                  </Pressable>
                </View>
              ) : null}
            </SummaryCard>

            <View style={[styles.calendarCard, { padding: calendarPadding }]}>
              <View style={styles.weekHeaderRow}>
                {WEEK_LABELS.map((item) => (
                  <Text key={item} style={[styles.weekLabel, { width: dayCellWidth }]}>
                    {item}
                  </Text>
                ))}
              </View>

              {monthGrid.map((week, rowIndex) => (
                <View style={styles.weekRow} key={`week-${rowIndex}`}>
                  {week.map((day) => {
                    const record = appData.dayRecords[day.dateKey];
                    const dayType = dayTypeOf(day.dateKey, appData.holidayDates, appData.halfHolidayDates);
                    const dayNumber = Number(day.dateKey.slice(-2));
                    const cardColor = dayStatusColor(record?.status ?? null, dayType, day.inMonth);
                    const isWorked = record?.status === "WORKED";
                    const isBulkSelected = bulkRangeSet.has(day.dateKey);
                    const isToday = day.dateKey === todayKey;
                    const isSelectedDay = selectedDateKey === day.dateKey;

                    return (
                      <Pressable
                        key={day.dateKey}
                        style={[
                          styles.dayCell,
                          {
                            width: dayCellWidth,
                            minHeight: dayCellHeight,
                            backgroundColor: cardColor,
                            opacity: day.inMonth ? 1 : 0.45,
                            borderWidth: isBulkSelected || isSelectedDay || isToday ? 2 : 0.5,
                            borderColor: isBulkSelected
                              ? "#0f766e"
                              : isSelectedDay
                                ? "#38bdf8"
                                : isToday
                                  ? "#f59e0b"
                                  : "#334155"
                          }
                        ]}
                        onPress={() => {
                          if (bulkSelectMode) {
                            if (!day.inMonth) {
                              setMonthKey(day.dateKey.slice(0, 7));
                            }
                            setBulkSelectionDate(day.dateKey);
                            return;
                          }
                          if (!day.inMonth) {
                            setMonthKey(day.dateKey.slice(0, 7));
                          }
                          setSelectedDateKey(day.dateKey);
                          setStatusModalVisible(true);
                        }}
                        onLongPress={() => {
                          if (!day.inMonth) {
                            setMonthKey(day.dateKey.slice(0, 7));
                          }
                          if (!bulkSelectMode) {
                            setBulkSelectMode(true);
                          }
                          setBulkSelectionDate(day.dateKey);
                        }}
                      >
                        <View style={styles.dayTopRow}>
                          <Text numberOfLines={1} style={[styles.dayNumber, !day.inMonth ? styles.dimText : null]}>
                            {dayNumber}
                          </Text>
                          <Text numberOfLines={1} style={styles.dayStatusShort}>
                            {dayStatusShort(record?.status ?? null)}
                          </Text>
                        </View>

                        <Text numberOfLines={1} style={[styles.dayTime, isWorked ? null : styles.dimText]}>
                          {isWorked
                            ? shortShiftLabel(record?.work?.start ?? appData.settings.defaultShiftStart, record?.work?.end ?? appData.settings.defaultShiftEnd)
                            : ""}
                        </Text>

                        <Text numberOfLines={1} style={styles.dayTag}>
                          {isToday ? "BugÃ¼n" : dayType === "UBGT" ? "UBGT" : dayType === "SUNDAY" ? "Pazar" : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={styles.monthDiffBox}>
              <Text style={styles.infoLabel}>Bu ay farkÄ±:</Text>
              <Text style={[styles.monthDiffValue, { color: differenceColor(summary.difference) }]}>
                {formatSignedCurrency(summary.difference)} ({monthlyDifferenceLabel(summary.difference)})
              </Text>
            </View>
          </View>
        ) : null}

        {activeTab === "SUMMARY" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DÃ¶nem Ã–zeti</Text>
            <Text style={styles.helper}>{monthLabelTr(monthKey)}</Text>
            {analytics.salaryWarning ? <Text style={styles.error}>{analytics.salaryWarning}</Text> : null}

            <View style={styles.optionWrap}>
              <Pressable style={styles.secondaryButton} onPress={downloadSalarySummaryPdf}>
                <Text style={styles.secondaryButtonText}>MaaÅŸ Ã–zeti PDF</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={downloadPuantajSummaryPdf}>
                <Text style={styles.secondaryButtonText}>Puantaj Ã–zeti PDF</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={downloadDailyDetailPdf}>
                <Text style={styles.secondaryButtonText}>GÃ¼n GÃ¼n Detay PDF</Text>
              </Pressable>
            </View>

            <SummaryCard title="DÃ¶nemler">
              <InfoRow label="Hesap dÃ¶nemi" value={periodText} />
              <InfoRow label="DÃ¶nem gÃ¼nÃ¼" value={`${summary.salaryPeriodDays}`} />
              <InfoRow label="Ã–denebilir gÃ¼n" value={`${summary.payableDays}`} />
              <InfoRow label="Fiili Ã§alÄ±ÅŸÄ±lan gÃ¼n" value={`${summary.workedDays}`} />
              <InfoRow label="Eksik/Ã¶denmeyen gÃ¼n" value={`${summary.nonPayableDays}`} />
              <InfoRow label="MaaÅŸ hak ediÅŸ oranÄ±" value={`%${summary.salaryRatioPercent}`} />
              <InfoRow label="MaaÅŸ hak ediÅŸi" value={formatCurrency(summary.baseSalary)} strong />
            </SummaryCard>

            <SummaryCard title="Ã‡alÄ±ÅŸma Durumu">
              <InfoRow label="Ã‡alÄ±ÅŸÄ±lan gÃ¼n" value={`${summary.workedDays}`} />
              <InfoRow label="Ä°zinli gÃ¼n" value={`${summary.leaveDays}`} />
              <InfoRow label="YÄ±llÄ±k izin" value={`${summary.annualLeaveDays}`} />
              <InfoRow label="Raporlu gÃ¼n" value={`${summary.reportDays}`} />
              <InfoRow label="Tatil gÃ¼n" value={`${summary.holidayOffDays}`} />
              <InfoRow label="Normal gÃ¼n" value={`${summary.normalWorkedDays}`} />
              <InfoRow label="Pazar gÃ¼n" value={`${summary.sundayWorkedDays}`} />
              <InfoRow label="UBGT gÃ¼n" value={`${summary.ubgtWorkedDays}`} />
              <InfoRow label="Toplam Ã§alÄ±ÅŸma saati" value={`${summary.totalHours} saat`} />
              <InfoRow label="GÃ¼nlÃ¼k 7.5 saat aÅŸÄ±mÄ±" value={`${summary.dailyOvertimeHours} saat`} />
              <InfoRow label="HaftalÄ±k 45 saat aÅŸÄ±mÄ±" value={`${summary.weeklyOvertimeRawHours} saat`} />
              <InfoRow label="HaftalÄ±k ilave mesai" value={`${summary.weeklyAdditionalOvertimeHours} saat`} />
              <InfoRow label="AylÄ±k 225 saat aÅŸÄ±mÄ±" value={`${summary.monthlyOvertimeRawHours} saat`} />
              <InfoRow label="AylÄ±k ilave mesai" value={`${summary.monthlyAdditionalOvertimeHours} saat`} />
              <InfoRow label="Ã‡ifte sayÄ±m dÃ¼ÅŸÃ¼lmÃ¼ÅŸ toplam" value={`${summary.overtimeHours} saat`} />
              <InfoRow label="GÃ¼nlÃ¼k ortalama mesai" value={`${summary.averageDailyOvertime} saat`} />
            </SummaryCard>

            <SummaryCard title="Hak EdiÅŸ">
              <InfoRow label="Saatlik Ã¼cret" value={formatCurrency(summary.hourlyRate)} />
              <InfoRow label="Fazla mesai katsayÄ±sÄ±" value={`${appData.settings.coefficients.overtime}`} />
              <InfoRow label="MaaÅŸ hak ediÅŸi" value={formatCurrency(summary.baseSalary)} />
              <InfoRow label="DÃ¶nem kesintisi" value={formatCurrency(summary.reportDeduction)} />
              <InfoRow label="Mesai hak ediÅŸi" value={formatCurrency(summary.overtimePay)} />
              <InfoRow label="Pazar hak ediÅŸi" value={formatCurrency(summary.sundayPay)} />
              <InfoRow label="UBGT hak ediÅŸi" value={formatCurrency(summary.ubgtPay)} />
            </SummaryCard>

            <SummaryCard title="Yemek / Yol">
              <InfoRow label="AylÄ±k yemek" value={formatCurrency(summary.monthlyMealAllowance)} />
              <InfoRow label="AylÄ±k yol" value={formatCurrency(summary.monthlyTransportAllowance)} />
              <InfoRow label="Yemek hak edilen gÃ¼n" value={`${summary.mealEntitledDays}`} />
              <InfoRow label="Yol hak edilen gÃ¼n" value={`${summary.transportEntitledDays}`} />
              <InfoRow label="Yemek gÃ¼nlÃ¼k oran" value={formatCurrency(summary.mealDailyRate)} />
              <InfoRow label="Yol gÃ¼nlÃ¼k oran" value={formatCurrency(summary.transportDailyRate)} />
              <InfoRow label="Yemek hak ediÅŸi" value={formatCurrency(summary.mealTotal)} />
              <InfoRow label="Yol hak ediÅŸi" value={formatCurrency(summary.transportTotal)} />
              <InfoRow label="Toplam yan hak" value={formatCurrency(summary.sideBenefitsTotal)} strong />
            </SummaryCard>

            <SummaryCard title="Eksik / Fazla">
              {isMonthClosed ? <Text style={styles.error}>Ay kapalÄ± olduÄŸu iÃ§in Ã¶demeler deÄŸiÅŸtirilemez.</Text> : null}

              <Text style={styles.label}>YatÄ±rÄ±lan maaÅŸ</Text>
              <TextInput
                value={paymentInputs.salary}
                onChangeText={(value) => updateMonthPaymentInput("salary", value)}
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>YatÄ±rÄ±lan mesai</Text>
              <TextInput
                value={paymentInputs.overtime}
                onChangeText={(value) => updateMonthPaymentInput("overtime", value)}
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>YatÄ±rÄ±lan pazar</Text>
              <TextInput
                value={paymentInputs.sunday}
                onChangeText={(value) => updateMonthPaymentInput("sunday", value)}
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>YatÄ±rÄ±lan UBGT</Text>
              <TextInput
                value={paymentInputs.ubgt}
                onChangeText={(value) => updateMonthPaymentInput("ubgt", value)}
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>YatÄ±rÄ±lan yemek</Text>
              <TextInput
                value={paymentInputs.meal}
                onChangeText={(value) => updateMonthPaymentInput("meal", value)}
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>YatÄ±rÄ±lan yol</Text>
              <TextInput
                value={paymentInputs.transport}
                onChangeText={(value) => updateMonthPaymentInput("transport", value)}
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Pressable
                style={[styles.secondaryButton, isMonthClosed ? styles.buttonDisabled : null]}
                onPress={saveMonthPayment}
                disabled={isMonthClosed}
              >
                <Text style={styles.secondaryButtonText}>Ã–demeyi Kaydet</Text>
              </Pressable>

              <InfoRow label="Toplam hak ediÅŸ" value={formatCurrency(summary.expectedTotal)} strong />
              <InfoRow label="YatÄ±rÄ±lan toplam" value={formatCurrency(summary.paidTotal)} strong />
              <InfoRow
                label="Fark"
                value={`${formatSignedCurrency(summary.difference)} (${monthlyDifferenceLabel(summary.difference)})`}
                strong
                valueColor={differenceColor(summary.difference)}
              />
            </SummaryCard>

            <SummaryCard title="Toplam Alacak / BorÃ§">
              {totalDifference < 0 ? (
                <InfoRow
                  label="Toplam alacaÄŸÄ±n"
                  value={formatCurrency(Math.abs(totalDifference))}
                  strong
                  valueColor="#b91c1c"
                />
              ) : totalDifference > 0 ? (
                <InfoRow
                  label="Fazla alÄ±nan"
                  value={formatSignedCurrency(totalDifference)}
                  strong
                  valueColor="#15803d"
                />
              ) : (
                <InfoRow label="Toplam durum" value="EÅŸit" strong valueColor="#475569" />
              )}
            </SummaryCard>

            <SummaryCard title="Analiz">
              <InfoRow label="MaaÅŸ Ã¶deme gÃ¼nÃ¼" value={`${analytics.salaryPaymentDay}`} />
              <InfoRow label="AylÄ±k hedef kazanÃ§" value={formatCurrency(analytics.monthlyTarget)} />
              <InfoRow label="Hedefe ulaÅŸma" value={`%${analytics.targetProgressPercent}`} />
              <InfoRow
                label="En Ã§ok kazandÄ±ran gÃ¼n"
                value={
                  analytics.mostEarningDayKey
                    ? `${formatDateKeyTr(analytics.mostEarningDayKey)} (${formatCurrency(analytics.mostEarningDayAmount)})`
                    : "-"
                }
              />
              <InfoRow
                label="En Ã§ok Ã§alÄ±ÅŸÄ±lan hafta gÃ¼nÃ¼"
                value={
                  analytics.mostWorkedWeekdayLabel
                    ? `${analytics.mostWorkedWeekdayLabel} (${analytics.mostWorkedWeekdayCount})`
                    : "-"
                }
              />
              <InfoRow label="Ã‡alÄ±ÅŸma oranÄ±" value={`%${analytics.workRatePercent}`} />
              <InfoRow label="Rapor oranÄ±" value={`%${analytics.reportRatePercent}`} />
              <InfoRow label="Ä°zin oranÄ±" value={`%${analytics.leaveRatePercent}`} />
            </SummaryCard>

          </View>
        ) : null}

        {activeTab === "APP_SETTINGS" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ayarlar</Text>
            <SummaryCard title="Hesap Bilgisi">
              <InfoRow label="KullanÄ±cÄ±" value={authUser.username} />
              <InfoRow label="Rol" value={authUser.role === "ADMIN" ? "YÃ¶netici" : "KullanÄ±cÄ±"} />
            </SummaryCard>
            <SummaryCard title="KiÅŸisel Bilgiler">
              <View style={styles.profileRow}>
                {appData.profile.avatarUrl.trim() ? (
                  <Image source={{ uri: appData.profile.avatarUrl.trim() }} style={styles.profileAvatar} />
                ) : (
                  <View style={styles.profileAvatarFallback}>
                    <Text style={styles.profileAvatarFallbackText}>
                      {profileInitials(appData.profile.fullName, authUser.username)}
                    </Text>
                  </View>
                )}
                <Text style={styles.helper}>Profil fotoÄŸrafÄ±nÄ± galeriden seÃ§ebilirsiniz.</Text>
              </View>

              <View style={styles.row}>
                <Pressable style={[styles.secondaryButton, styles.flexInput]} onPress={() => void pickProfileImage()}>
                  <Text style={styles.secondaryButtonText}>Galeriden FotoÄŸraf SeÃ§</Text>
                </Pressable>
                {appData.profile.avatarUrl.trim() ? (
                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => {
                      const previousUri = appData.profile.avatarUrl.trim();
                      if (previousUri && previousUri.startsWith(FileSystem.documentDirectory ?? "")) {
                        void FileSystem.deleteAsync(previousUri, { idempotent: true }).catch(() => {});
                      }
                      setProfileField("avatarUrl", "");
                    }}
                  >
                    <Text style={styles.deleteButtonText}>FotoÄŸrafÄ± KaldÄ±r</Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.label}>Ad soyad</Text>
              <TextInput
                value={appData.profile.fullName}
                onChangeText={(value) => setProfileField("fullName", value)}
                style={styles.input}
              />
              <Text style={styles.label}>Telefon</Text>
              <TextInput
                value={appData.profile.phone}
                onChangeText={(value) => setProfileField("phone", value)}
                style={styles.input}
                keyboardType="phone-pad"
              />
              <Text style={styles.label}>E-posta</Text>
              <TextInput
                value={appData.profile.email}
                onChangeText={(value) => setProfileField("email", value)}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Text style={styles.label}>Adres</Text>
              <TextInput
                value={appData.profile.address}
                onChangeText={(value) => setProfileField("address", value)}
                style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
                multiline
              />

              <Pressable
                style={styles.deleteButton}
                onPress={() =>
                  setAppData((prev) => ({
                    ...prev,
                    profile: {
                      fullName: "",
                      phone: "",
                      email: "",
                      address: "",
                      avatarUrl: ""
                    }
                  }))
                }
              >
                <Text style={styles.deleteButtonText}>KiÅŸisel Bilgileri Temizle</Text>
              </Pressable>
            </SummaryCard>
            <SummaryCard title="GÃ¼venlik">
              <Text style={styles.helper}>
                HesabÄ±nÄ±z bu cihazda gÃ¼venli ÅŸekilde tutulur. Ã‡Ä±kÄ±ÅŸ yaptÄ±ÄŸÄ±nÄ±zda oturum kapatÄ±lÄ±r.
              </Text>
              <Pressable style={styles.deleteButton} onPress={handleLogout}>
                <Text style={styles.deleteButtonText}>Ã‡Ä±kÄ±ÅŸ Yap</Text>
              </Pressable>
            </SummaryCard>
          </View>
        ) : null}

        {activeTab === "SUPPORT" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Destek</Text>
            <SummaryCard title="Ä°letiÅŸime GeÃ§">
              <Text style={styles.helper}>
                Sorununuzu kÄ±sa ve net yazarak destek talebi oluÅŸturabilirsiniz.
              </Text>
              <InfoRow label="Destek e-posta" value="yusufavsarsgu@gmail.com" />
              <InfoRow label="Ã‡alÄ±ÅŸma saati" value="09:00 - 18:00" />
              <Text style={styles.label}>Konu</Text>
              <TextInput
                value={supportSubject}
                onChangeText={setSupportSubject}
                style={styles.input}
                placeholder="Ã–rn: GiriÅŸ sorunu"
              />
              <Text style={styles.label}>Mesaj</Text>
              <TextInput
                value={supportMessage}
                onChangeText={setSupportMessage}
                style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
                multiline
                placeholder="YaÅŸadÄ±ÄŸÄ±nÄ±z sorunu yazÄ±n"
              />
              <Pressable style={styles.secondaryButton} onPress={() => void openSupportContact()}>
                <Text style={styles.secondaryButtonText}>Destek Talebi OluÅŸtur</Text>
              </Pressable>
            </SummaryCard>
          </View>
        ) : null}

        {activeTab === "SETTINGS" && authUser.role === "ADMIN" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ã–zel Ayarlar</Text>

            <Text style={styles.label}>Bordro baz aylÄ±k Ã¼cret</Text>
            <NumericInput
              value={appData.settings.monthlySalary}
              onCommit={(value) => setNumericSetting("monthlySalary", value)}
            />

            <Text style={styles.label}>AylÄ±k baz saat</Text>
            <NumericInput
              value={appData.settings.monthlyBaseHours}
              onCommit={(value) => setNumericSetting("monthlyBaseHours", value)}
            />

            <Text style={styles.label}>HaftalÄ±k fazla mesai eÅŸiÄŸi</Text>
            <NumericInput
              value={appData.settings.weeklyOvertimeThresholdHours}
              onCommit={(value) => setNumericSetting("weeklyOvertimeThresholdHours", value)}
            />

            <Text style={styles.label}>GÃ¼nlÃ¼k fazla mesai eÅŸiÄŸi</Text>
            <NumericInput
              value={appData.settings.dailyOvertimeThresholdHours}
              onCommit={(value) => setNumericSetting("dailyOvertimeThresholdHours", value)}
            />

            <Text style={styles.label}>Mesai katsayÄ±sÄ±</Text>
            <NumericInput
              value={appData.settings.coefficients.overtime}
              onCommit={(value) => setCoefficient("overtime", value)}
            />

            <Text style={styles.label}>Pazar katsayÄ±sÄ±</Text>
            <NumericInput
              value={appData.settings.coefficients.sunday}
              onCommit={(value) => setCoefficient("sunday", value)}
            />

            <Text style={styles.label}>UBGT katsayÄ±sÄ±</Text>
            <NumericInput
              value={appData.settings.coefficients.holiday}
              onCommit={(value) => setCoefficient("holiday", value)}
            />

            <Text style={styles.label}>VarsayÄ±lan vardiya baÅŸlangÄ±cÄ±</Text>
            <TextInput
              value={appData.settings.defaultShiftStart}
              onChangeText={(value) => setStringSetting("defaultShiftStart", value)}
              style={styles.input}
              placeholder="20:00"
            />

            <Text style={styles.label}>VarsayÄ±lan vardiya bitiÅŸi</Text>
            <TextInput
              value={appData.settings.defaultShiftEnd}
              onChangeText={(value) => setStringSetting("defaultShiftEnd", value)}
              style={styles.input}
              placeholder="08:00"
            />

            <Text style={styles.label}>VarsayÄ±lan toplam saat</Text>
            <NumericInput
              value={appData.settings.defaultShiftHours}
              onCommit={(value) => setNumericSetting("defaultShiftHours", value)}
            />

            <Text style={styles.label}>VarsayÄ±lan mesai saat</Text>
            <NumericInput
              value={appData.settings.defaultOvertimeHours}
              onCommit={(value) => setNumericSetting("defaultOvertimeHours", value)}
            />

            <Text style={styles.label}>AylÄ±k yemek parasÄ±</Text>
            <NumericInput
              value={appData.settings.monthlyMealAllowance}
              onCommit={(value) => setNumericSetting("monthlyMealAllowance", value)}
            />

            <Text style={styles.label}>AylÄ±k yol parasÄ±</Text>
            <NumericInput
              value={appData.settings.monthlyTransportAllowance}
              onCommit={(value) => setNumericSetting("monthlyTransportAllowance", value)}
            />

            <Text style={styles.label}>Yemek/yol hak ediÅŸ yÃ¶ntemi</Text>
            <View style={styles.optionWrap}>
              {MEAL_TRANSPORT_METHOD_OPTIONS.map((item) => (
                <Pressable
                  key={item.value}
                  style={[
                    styles.optionButton,
                    appData.settings.mealTransportAccrualMethod === item.value ? styles.optionButtonActive : null
                  ]}
                  onPress={() =>
                    setAppData((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        mealTransportAccrualMethod: item.value
                      }
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      appData.settings.mealTransportAccrualMethod === item.value ? styles.optionButtonTextActive : null
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>MaaÅŸ Ã¶deme gÃ¼nÃ¼</Text>
            <NumericInput
              value={appData.settings.salaryPaymentDay}
              onCommit={(value) => setNumericSetting("salaryPaymentDay", value)}
              placeholder="5"
            />

            <Text style={styles.label}>AylÄ±k hedef kazanÃ§</Text>
            <NumericInput
              value={appData.settings.monthlyTarget}
              onCommit={(value) => setNumericSetting("monthlyTarget", value)}
            />

            <Text style={styles.sectionTitle}>Resmi Tatil / UBGT</Text>
            <View style={styles.row}>
              <TextInput
                value={holidayInput}
                onChangeText={setHolidayInput}
                autoCapitalize="none"
                placeholder="2026-03-20"
                style={[styles.input, styles.flexInput]}
              />
              <Pressable style={styles.secondaryButton} onPress={addHolidayDate}>
                <Text style={styles.secondaryButtonText}>Ekle</Text>
              </Pressable>
            </View>

            {visibleHolidayDates.map((dateKey) => (
              <View style={styles.row} key={dateKey}>
                <Text style={styles.shiftText}>{dateKey}</Text>
                <Pressable style={styles.deleteButton} onPress={() => removeHolidayDate(dateKey)}>
                  <Text style={styles.deleteButtonText}>Sil</Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.row}>
              {!isMonthClosed ? (
                <Pressable style={styles.secondaryButton} onPress={closeMonth}>
                  <Text style={styles.secondaryButtonText}>AyÄ± Kapat</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.secondaryButton} onPress={openMonth}>
                  <Text style={styles.secondaryButtonText}>AyÄ± AÃ§</Text>
                </Pressable>
              )}

              <Pressable style={styles.deleteButton} onPress={resetSystem}>
                <Text style={styles.deleteButtonText}>TÃ¼m Sistemi SÄ±fÄ±rla</Text>
              </Pressable>
            </View>
            {authUser.role === "ADMIN" ? (
              <Pressable style={styles.deleteButton} onPress={resetEverything}>
                <Text style={styles.deleteButtonText}>KullanÄ±cÄ±lar Dahil Tam SÄ±fÄ±rla</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {activeTab === "SYNC" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Senkronizasyon</Text>
            <Text style={styles.helper}>
              Uygulama verileri gÃ¼venli ÅŸekilde eÅŸitlenir. Teknik ayrÄ±ntÄ±lar kullanÄ±cÄ±ya gÃ¶sterilmez.
            </Text>

            <InfoRow label="Bağlantı durumu" value={backendConnected ? "Bağlı" : "Kısmi / Çevrimdışı"} />
            <InfoRow label="Backend URL" value={getApiBaseUrl()} />
            <Text style={styles.helper}>
              Bağlantı geçici olarak kesilirse uygulama yerelde çalışmaya devam eder, bağlantı yeniden kurulunca veriler
              otomatik eşitlenir.
            </Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={async () => {
                const results = await testBackendHealth();
                const ok = results.some((item) => item.ok);
                setBackendConnected(ok);
                Alert.alert(
                  "Bağlantı kontrolü",
                  ok
                    ? "Bağlantı başarılı. Sunucu çalışıyor."
                    : `Bağlantı kurulamadı. İnternet, Render cold start veya servis adresi kaynaklı olabilir.\n\nGeliştirici detayı:\n${results
                        .map((item) => `${item.url} | ${item.status ?? "-"} | ${item.error ?? "OK"} | ${new Date(item.checkedAt).toLocaleString("tr-TR")}`)
                        .join("\n")}`
                );
              }}
            >
              <Text style={styles.secondaryButtonText}>BaÄŸlantÄ±yÄ± Test Et</Text>
            </Pressable>
          </View>
        ) : null}

        {activeTab === "USERS" && authUser.role === "ADMIN" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>YÃ¶netim Paneli</Text>
            <Text style={styles.helper}>
              YÃ¶netici iÅŸlemleri gÃ¼venli servis Ã¼zerinden yapÄ±lÄ±r ve denetim kayÄ±tlarÄ±na iÅŸlenir.
            </Text>
            {adminError ? <Text style={styles.error}>{adminError}</Text> : null}

            <View style={styles.row}>
              <Pressable
                style={[styles.secondaryButton, styles.flexInput]}
                onPress={async () => {
                  await refreshAdminStats();
                  await refreshAdminUsers();
                  await refreshAdminIpBans();
                }}
                disabled={adminBusy}
              >
                <Text style={styles.secondaryButtonText}>Paneli Yenile</Text>
              </Pressable>
            </View>

            <SummaryCard title="Dashboard">
              <InfoRow label="Toplam kullanÄ±cÄ±" value={`${adminStats?.totalUsers ?? 0}`} />
              <InfoRow label="Aktif kullanÄ±cÄ±" value={`${adminStats?.activeUsers ?? 0}`} />
              <InfoRow label="BanlÄ± kullanÄ±cÄ±" value={`${adminStats?.bannedUsers ?? 0}`} />
              {(adminStats?.recentLogins ?? []).map((item) => (
                <InfoRow
                  key={item.id}
                  label={item.username}
                  value={`${item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString("tr-TR") : "-"} | ${item.lastIp ?? "-"}`}
                />
              ))}
            </SummaryCard>

            <SummaryCard title="KullanÄ±cÄ± Listesi">
              <TextInput
                value={adminSearch}
                onChangeText={setAdminSearch}
                style={styles.input}
                autoCapitalize="none"
                placeholder="KullanÄ±cÄ± adÄ± ara"
              />
              <Pressable
                style={styles.secondaryButton}
                onPress={refreshAdminUsers}
                disabled={adminBusy}
              >
                <Text style={styles.secondaryButtonText}>KullanÄ±cÄ± Ara / Yenile</Text>
              </Pressable>
              {adminUsers.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.summaryCard}
                  onPress={() => openAdminUserDetail(item.id)}
                >
                  <InfoRow label={item.username} value={item.role === "ADMIN" ? "YÃ¶netici" : "KullanÄ±cÄ±"} />
                  <InfoRow
                    label="Durum"
                    value={`${item.isActive ? "Aktif" : "Pasif"} / ${item.isBanned ? "BanlÄ±" : "Ban yok"}`}
                  />
                  <InfoRow
                    label="Son giriÅŸ"
                    value={item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString("tr-TR") : "-"}
                  />
                  <InfoRow label="Son IP" value={item.lastIp ?? "-"} />
                  <InfoRow label="Cihaz" value={item.deviceInfo ?? "-"} />
                </Pressable>
              ))}
            </SummaryCard>

            {adminSelectedUser ? (
              <SummaryCard title={`Detay: ${adminSelectedUser.user.username}`}>
                <InfoRow label="IP" value={adminSelectedUser.user.lastIp ?? "-"} />
                <InfoRow label="Cihaz" value={adminSelectedUser.user.deviceInfo ?? "-"} />
                <InfoRow label="Ban sebebi" value={adminSelectedUser.user.banReason ?? "-"} />
                <InfoRow
                  label="Ban süresi"
                  value={
                    adminSelectedUser.user.bannedUntil
                      ? new Date(adminSelectedUser.user.bannedUntil).toLocaleString("tr-TR")
                      : "Süresiz / ban yok"
                  }
                />
                <InfoRow label="Başarısız giriş" value={`${adminSelectedUser.user.failedLoginCount ?? 0}`} />
                <InfoRow
                  label="Aktif oturum"
                  value={`${adminSelectedUser.sessions.filter((item) => !item.revokedAt).length}`}
                />
                <InfoRow label="KayÄ±t tarihi" value={new Date(adminSelectedUser.user.createdAt).toLocaleString("tr-TR")} />
                <InfoRow
                  label="Son giriÅŸ"
                  value={adminSelectedUser.user.lastLoginAt ? new Date(adminSelectedUser.user.lastLoginAt).toLocaleString("tr-TR") : "-"}
                />
                <Text style={styles.label}>Oturum geÃ§miÅŸi</Text>
                {adminSelectedUser.sessions.slice(0, 5).map((session) => (
                  <View key={session.id} style={styles.adminSessionRow}>
                    <InfoRow label="IP" value={session.ipAddress ?? "-"} />
                    <InfoRow label="Cihaz" value={session.deviceInfo ?? "-"} />
                    <InfoRow label="BaÅŸlangÄ±Ã§" value={new Date(session.createdAt).toLocaleString("tr-TR")} />
                    <InfoRow label="Durum" value={session.revokedAt ? "SonlandÄ±" : "Aktif"} />
                  </View>
                ))}
                <Text style={styles.label}>Giriş denemeleri</Text>
                {(adminSelectedUser.loginAttempts ?? []).slice(0, 5).map((attempt) => (
                  <View key={attempt.id} style={styles.adminSessionRow}>
                    <InfoRow label="Sonuç" value={attempt.success ? "Başarılı" : `Başarısız: ${attempt.failReason ?? "-"}`} />
                    <InfoRow label="IP" value={attempt.ipAddress ?? "-"} />
                    <InfoRow label="Tarih" value={new Date(attempt.createdAt).toLocaleString("tr-TR")} />
                  </View>
                ))}
                <Text style={styles.label}>Admin notları</Text>
                {(adminSelectedUser.adminNotes ?? []).slice(0, 5).map((note) => (
                  <View key={note.id} style={styles.adminSessionRow}>
                    <Text style={styles.shiftText}>{note.note}</Text>
                    <Text style={styles.helper}>{new Date(note.createdAt).toLocaleString("tr-TR")}</Text>
                  </View>
                ))}
                <TextInput
                  value={adminNoteInput}
                  onChangeText={setAdminNoteInput}
                  style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
                  placeholder="Admin notu ekle"
                  multiline
                />
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() =>
                    runAdminAction(async () => {
                      if (!adminSelectedUser || !adminNoteInput.trim()) return;
                      await adminAddUserNote(adminSelectedUser.user.id, adminNoteInput.trim());
                      setAdminNoteInput("");
                    })
                  }
                  disabled={adminBusy}
                >
                  <Text style={styles.secondaryButtonText}>Admin Notu Ekle</Text>
                </Pressable>
                <Text style={styles.label}>Yeni ban sebebi</Text>
                <TextInput
                  value={adminBanReason}
                  onChangeText={setAdminBanReason}
                  style={styles.input}
                  placeholder="Ban sebebini yaz"
                />
                <Text style={styles.label}>Ban süresi (saat, boş bırakılırsa süresiz)</Text>
                <TextInput
                  value={adminBanDurationHours}
                  onChangeText={setAdminBanDurationHours}
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="Örn: 24"
                />

                <View style={styles.optionWrap}>
                  <Pressable
                    style={styles.optionButton}
                    onPress={() =>
                      runAdminAction(() =>
                        adminBanUser(
                          adminSelectedUser.user.id,
                          adminBanReason || "Admin tarafÄ±ndan banlandÄ±.",
                          adminBanDurationHours.trim() ? safePositive(tryParseNumber(adminBanDurationHours)) : undefined
                        )
                      )
                    }
                    disabled={adminBusy}
                  >
                    <Text style={styles.optionButtonText}>Banla</Text>
                  </Pressable>
                  <Pressable
                    style={styles.optionButton}
                    onPress={() => runAdminAction(() => adminUnbanUser(adminSelectedUser.user.id))}
                    disabled={adminBusy}
                  >
                    <Text style={styles.optionButtonText}>Ban KaldÄ±r</Text>
                  </Pressable>
                  <Pressable
                    style={styles.optionButton}
                    onPress={() => runAdminAction(() => adminDisableUser(adminSelectedUser.user.id))}
                    disabled={adminBusy}
                  >
                    <Text style={styles.optionButtonText}>Pasif Yap</Text>
                  </Pressable>
                  <Pressable
                    style={styles.optionButton}
                    onPress={() => runAdminAction(() => adminEnableUser(adminSelectedUser.user.id))}
                    disabled={adminBusy}
                  >
                    <Text style={styles.optionButtonText}>Aktif Yap</Text>
                  </Pressable>
                  <Pressable
                    style={styles.optionButton}
                    onPress={() => runAdminAction(() => adminRevokeUserSessions(adminSelectedUser.user.id))}
                    disabled={adminBusy}
                  >
                    <Text style={styles.optionButtonText}>OturumlarÄ± SonlandÄ±r</Text>
                  </Pressable>
                  <Pressable
                    style={styles.optionButton}
                    onPress={() => runAdminAction(() => adminDeleteUserData(adminSelectedUser.user.id))}
                    disabled={adminBusy}
                  >
                    <Text style={styles.optionButtonText}>Verileri Sil</Text>
                  </Pressable>
                </View>
              </SummaryCard>
            ) : null}

            <SummaryCard title="IP Ban YÃ¶netimi">
              <Text style={styles.label}>IP adresi</Text>
              <TextInput
                value={adminIpInput}
                onChangeText={setAdminIpInput}
                style={styles.input}
                placeholder="Ã–rn: 85.111.22.33"
                autoCapitalize="none"
              />
              <Text style={styles.label}>Sebep</Text>
              <TextInput
                value={adminIpReason}
                onChangeText={setAdminIpReason}
                style={styles.input}
                placeholder="GÃ¼venlik ihlali"
              />
              <Pressable
                style={styles.secondaryButton}
                onPress={() =>
                  void runAdminAction(async () => {
                    if (!adminIpInput.trim()) {
                      Alert.alert("Eksik bilgi", "IP adresi boÅŸ olamaz.");
                      return;
                    }
                    await adminAddIpBan(adminIpInput.trim(), adminIpReason);
                    setAdminIpInput("");
                  })
                }
                disabled={adminBusy}
              >
                <Text style={styles.secondaryButtonText}>IP Ban Ekle</Text>
              </Pressable>
              {adminIpBans.length === 0 ? (
                <Text style={styles.helper}>Aktif IP ban kaydÄ± bulunmuyor.</Text>
              ) : (
                adminIpBans.map((item) => (
                  <View key={item.id} style={styles.summaryCard}>
                    <InfoRow label="IP" value={item.ipAddress} />
                    <InfoRow label="Sebep" value={item.reason || "-"} />
                    <InfoRow label="Tarih" value={new Date(item.createdAt).toLocaleString("tr-TR")} />
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => void runAdminAction(() => adminRemoveIpBan(item.id))}
                      disabled={adminBusy}
                    >
                      <Text style={styles.deleteButtonText}>Ban KaldÄ±r</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </SummaryCard>
          </View>
        ) : null}

        {activeTab === "LEGAL" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hukuk</Text>

            {LEGAL_SECTIONS.map((section) => (
              <View key={section.id} style={styles.legalSectionCard}>
                <Pressable style={styles.row} onPress={() => toggleLegalSection(section.id)}>
                  <Text style={styles.label}>{section.title}</Text>
                  <Text style={styles.label}>{openLegalSectionMap[section.id] ? "-" : "+"}</Text>
                </Pressable>
                {openLegalSectionMap[section.id] ? <Text style={styles.legalNote}>{section.content}</Text> : null}
              </View>
            ))}

            <Text style={styles.legalWarning}>
              Bu uygulamadaki bilgiler yalnÄ±zca bilgilendirme amaÃ§lÄ±dÄ±r. ResmÃ® hukuki danÄ±ÅŸmanlÄ±k yerine geÃ§mez.
            </Text>

            <SummaryCard title="Ä°stifa / Fesih DilekÃ§esi Åablonu">
              <Text style={styles.label}>Åablon seÃ§imi</Text>
              <View style={styles.optionWrap}>
                {LETTER_TEMPLATE_OPTIONS.map((item) => (
                  <Pressable
                    key={item.value}
                    style={[styles.optionButton, selectedLetterTemplate === item.value ? styles.optionButtonActive : null]}
                    onPress={() => {
                      setSelectedLetterTemplate(item.value);
                      setResignationField("customDraft", "");
                    }}
                  >
                    <Text style={[styles.optionButtonText, selectedLetterTemplate === item.value ? styles.optionButtonTextActive : null]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Ad soyad</Text>
              <TextInput value={appData.legal.resignationForm.fullName} onChangeText={(v) => setResignationField("fullName", v)} style={styles.input} />
              <Text style={styles.label}>T.C. kimlik no</Text>
              <TextInput value={appData.legal.resignationForm.tcNo} onChangeText={(v) => setResignationField("tcNo", v)} style={styles.input} keyboardType="number-pad" />
              <Text style={styles.label}>Adres</Text>
              <TextInput value={appData.legal.resignationForm.address} onChangeText={(v) => setResignationField("address", v)} style={styles.input} />
              <Text style={styles.label}>Telefon</Text>
              <TextInput value={appData.legal.resignationForm.phone} onChangeText={(v) => setResignationField("phone", v)} style={styles.input} keyboardType="phone-pad" />
              <Text style={styles.label}>Ä°ÅŸ yeri / Ã¼nvan</Text>
              <TextInput value={appData.legal.resignationForm.workplaceTitle} onChangeText={(v) => setResignationField("workplaceTitle", v)} style={styles.input} />
              <Text style={styles.label}>Departman</Text>
              <TextInput value={appData.legal.resignationForm.department} onChangeText={(v) => setResignationField("department", v)} style={styles.input} />
              <Text style={styles.label}>Ä°ÅŸe giriÅŸ tarihi (01.01.2025)</Text>
              <TextInput value={appData.legal.resignationForm.hireDate} onChangeText={(v) => setResignationField("hireDate", v)} style={styles.input} keyboardType="number-pad" />
              <Text style={styles.label}>AyrÄ±lÄ±ÅŸ / fesih tarihi (01.01.2026)</Text>
              <TextInput value={appData.legal.resignationForm.leaveDate} onChangeText={(v) => setResignationField("leaveDate", v)} style={styles.input} keyboardType="number-pad" />
              <Text style={styles.label}>DilekÃ§e tarihi (01.01.2026)</Text>
              <TextInput value={appData.legal.resignationForm.letterDate} onChangeText={(v) => setResignationField("letterDate", v)} style={styles.input} keyboardType="number-pad" />
              <Text style={styles.label}>AÃ§Ä±klama</Text>
              <TextInput
                value={appData.legal.resignationForm.explanation}
                onChangeText={(v) => setResignationField("explanation", v)}
                style={[styles.input, { minHeight: 72, textAlignVertical: "top" }]}
                multiline
              />
              <Text style={styles.label}>DilekÃ§e metni (dÃ¼zenlenebilir)</Text>
              <TextInput
                value={appData.legal.resignationForm.customDraft || generatedDraft}
                onChangeText={(v) => setResignationField("customDraft", v)}
                style={[styles.input, { minHeight: 240, textAlignVertical: "top", fontSize: 13 }]}
                multiline
              />
              <Pressable style={styles.secondaryButton} onPress={downloadResignationPdf}>
                <Text style={styles.secondaryButtonText}>Ä°stifa/Fesih DilekÃ§esi PDF Ä°ndir</Text>
              </Pressable>
            </SummaryCard>

            <SummaryCard title="KÄ±dem / Ä°hbar Hesaplama">
              <Text style={styles.label}>Ä°ÅŸe giriÅŸ tarihi (01.01.2025)</Text>
              <TextInput value={appData.legal.hireDate} onChangeText={(value) => setLegalField("hireDate", value)} keyboardType="number-pad" style={styles.input} />
              <Text style={styles.label}>Ä°ÅŸten Ã§Ä±kÄ±ÅŸ tarihi (01.01.2026)</Text>
              <TextInput value={appData.legal.terminationDate} onChangeText={(value) => setLegalField("terminationDate", value)} keyboardType="number-pad" style={styles.input} />
              {legalDateFormatWarning ? <Text style={styles.error}>{legalDateFormatWarning}</Text> : null}

              <Text style={styles.label}>BrÃ¼t maaÅŸ</Text>
              <TextInput value={String(appData.legal.grossSalary)} onChangeText={(value) => setLegalField("grossSalary", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>AylÄ±k yemek parasÄ±</Text>
              <TextInput value={String(appData.legal.mealAllowance)} onChangeText={(value) => setLegalField("mealAllowance", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>AylÄ±k yol parasÄ±</Text>
              <TextInput value={String(appData.legal.transportAllowance)} onChangeText={(value) => setLegalField("transportAllowance", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>DiÄŸer dÃ¼zenli yan haklar</Text>
              <TextInput value={String(appData.legal.otherAllowance)} onChangeText={(value) => setLegalField("otherAllowance", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>KullanÄ±lmayan izin gÃ¼nÃ¼</Text>
              <TextInput value={String(appData.legal.unusedAnnualLeaveDays)} onChangeText={(value) => setLegalField("unusedAnnualLeaveDays", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>Damga vergisi oranÄ± (%)</Text>
              <TextInput value={String(appData.legal.stampTaxRate)} onChangeText={(value) => setLegalField("stampTaxRate", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>KÄ±dem tavanÄ±</Text>
              <TextInput value={String(appData.legal.severanceCap)} onChangeText={(value) => setLegalField("severanceCap", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>Fesih nedeni</Text>
              <TextInput value={appData.legal.terminationReason} onChangeText={(value) => setAppData((prev) => ({ ...prev, legal: { ...prev.legal, terminationReason: value } }))} style={styles.input} />

              <Text style={styles.label}>Fesih tipi</Text>
              <View style={styles.optionWrap}>
                {TERMINATION_TYPE_OPTIONS.map((item) => (
                  <Pressable
                    key={item.value}
                    style={[styles.optionButton, appData.legal.terminationType === item.value ? styles.optionButtonActive : null]}
                    onPress={() => setLegalField("terminationType", item.value)}
                  >
                    <Text style={[styles.optionButtonText, appData.legal.terminationType === item.value ? styles.optionButtonTextActive : null]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </SummaryCard>

            <SummaryCard title="Hesap SonuÃ§larÄ±">
              <InfoRow label="Toplam Ã§alÄ±ÅŸma sÃ¼resi" value={legalResult.serviceText} />
              <InfoRow label="KÄ±dem tazminatÄ± tahmini" value={formatCurrency(legalResult.severancePayNet)} />
              <InfoRow label="Ä°hbar sÃ¼resi" value={`${legalResult.noticeWeeks} hafta`} />
              <InfoRow label="Ä°hbar tazminatÄ± tahmini" value={formatCurrency(legalResult.noticePay)} />
              <InfoRow label="KullanÄ±lmayan izin tahmini" value={formatCurrency(legalResult.annualLeavePay)} />
              <InfoRow label="Toplam tahmini alacak" value={formatCurrency(legalResult.estimatedTotal)} strong />
              <Pressable style={styles.secondaryButton} onPress={downloadLegalCalculationPdf}>
                <Text style={styles.secondaryButtonText}>KÄ±dem/Ä°hbar PDF Ä°ndir</Text>
              </Pressable>
            </SummaryCard>

            <Text style={styles.legalWarning}>{HUKUK_UYARI_METNI}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={drawerVisible} transparent animationType="slide" onRequestClose={closeDrawer}>
        <Pressable style={styles.drawerOverlay} onPress={closeDrawer}>
          <Pressable style={styles.drawerPanel} onPress={() => {}}>
            <Text style={styles.drawerBrand}>AYFSOFT</Text>
            <Text style={styles.drawerSub}>{MARKA_METNI}</Text>

            <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("CALENDAR")}>
              <Text style={styles.drawerItemText}>Takvim</Text>
            </Pressable>
            <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("SUMMARY")}>
              <Text style={styles.drawerItemText}>Ã–zet</Text>
            </Pressable>

            {authUser.role === "ADMIN" ? (
              <>
                <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("SETTINGS")}>
                  <Text style={styles.drawerItemText}>Ã–zel Ayarlar</Text>
                </Pressable>
                <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("SYNC")}>
                  <Text style={styles.drawerItemText}>Senkronizasyon</Text>
                </Pressable>
              </>
            ) : null}

            <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("LEGAL")}>
              <Text style={styles.drawerItemText}>Hukuk</Text>
            </Pressable>

            {authUser.role === "ADMIN" ? (
              <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("USERS")}>
                <Text style={styles.drawerItemText}>KullanÄ±cÄ±lar</Text>
              </Pressable>
            ) : null}

            <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("APP_SETTINGS")}>
              <Text style={styles.drawerItemText}>Ayarlar</Text>
            </Pressable>
            <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("SUPPORT")}>
              <Text style={styles.drawerItemText}>Destek</Text>
            </Pressable>

            <Pressable
              style={[styles.drawerItem, styles.drawerExitItem]}
              onPress={() => {
                closeDrawer();
                void handleLogout();
              }}
            >
              <Text style={styles.drawerExitText}>Ã‡Ä±kÄ±ÅŸ</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <Text style={styles.footerText} numberOfLines={2}>{MARKA_METNI}</Text>
      </View>

      <Modal visible={statusModalVisible} transparent animationType="fade" onRequestClose={() => setStatusModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {selectedDateKey ? `${formatDateKeyTr(selectedDateKey)} iÃ§in durum seÃ§` : "Durum seÃ§"}
            </Text>
            <Text style={styles.helper}>GÃ¼n tÃ¼rÃ¼: {dayTypeLabel(selectedDayType)}</Text>
            <Text style={styles.helper}>Mevcut durum: {dayStatusLabel(selectedDayRecord?.status ?? null)}</Text>

            {selectedDayRecord?.status === "WORKED" ? (
              <View style={styles.workInfoBox}>
                <Text style={styles.label}>BaÅŸlangÄ±Ã§ saati</Text>
                <TextInput value={dayEditStart} onChangeText={setDayEditStart} style={styles.input} editable={!isMonthClosed} keyboardType="visible-password" placeholder="20:00" />
                <Text style={styles.label}>BitiÅŸ saati</Text>
                <TextInput value={dayEditEnd} onChangeText={setDayEditEnd} style={styles.input} editable={!isMonthClosed} keyboardType="visible-password" placeholder="08:00" />
                <Text style={styles.label}>Toplam saat</Text>
                <TextInput value={dayEditTotalHours} onChangeText={setDayEditTotalHours} style={styles.input} editable={!isMonthClosed} keyboardType="visible-password" placeholder="12" />
                <Text style={styles.label}>Mola dakika</Text>
                <TextInput value={dayEditBreakMinutes} onChangeText={setDayEditBreakMinutes} style={styles.input} editable={!isMonthClosed} keyboardType="visible-password" placeholder="0" />
                <Text style={styles.workInfoText}>Otomatik gÃ¼nlÃ¼k mesai: {selectedAutoDailyOvertime} saat</Text>
                <Text style={styles.label}>Manuel mesai dÃ¼zeltme</Text>
                <TextInput value={dayEditManualOvertime} onChangeText={setDayEditManualOvertime} style={styles.input} editable={!isMonthClosed} keyboardType="visible-password" placeholder="BoÅŸsa otomatik hesaplanÄ±r" />
                <Text style={styles.label}>Not</Text>
                <TextInput value={dayEditNote} onChangeText={setDayEditNote} style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]} editable={!isMonthClosed} multiline />
                <Text style={styles.helper}>
                  Yemek/Yol: {selectedDateKey && isMealTransportEligible(selectedDateKey, selectedDayType, "WORKED", appData.halfHolidayDates) ? "Hak eder" : "Hak etmez"}
                </Text>
                <Pressable style={styles.primaryButton} onPress={saveSelectedDayDetail} disabled={isMonthClosed}>
                  <Text style={styles.primaryButtonText}>GÃ¼n DetayÄ±nÄ± Kaydet</Text>
                </Pressable>
              </View>
            ) : null}

            {isMonthClosed ? <Text style={styles.error}>Bu ay kapalÄ±, deÄŸiÅŸiklik yapÄ±lamaz.</Text> : null}

            <View style={styles.modalButtonGrid}>
              <ModalButton
                title="Ã‡alÄ±ÅŸtÄ±m"
                onPress={() => updateDayStatus("WORKED")}
                disabled={isMonthClosed}
                tone="primary"
              />
              <ModalButton
                title="Ä°zinli"
                onPress={() => updateDayStatus("LEAVE")}
                disabled={isMonthClosed}
                tone="secondary"
              />
              <ModalButton
                title="YÄ±llÄ±k Ä°zin"
                onPress={() => updateDayStatus("ANNUAL_LEAVE")}
                disabled={isMonthClosed}
                tone="secondary"
              />
              <ModalButton
                title="Raporlu"
                onPress={() => updateDayStatus("REPORT")}
                disabled={isMonthClosed}
                tone="secondary"
              />
              <ModalButton
                title="Tatil"
                onPress={() => updateDayStatus("HOLIDAY_OFF")}
                disabled={isMonthClosed}
                tone="secondary"
              />
              <ModalButton title="Temizle" onPress={() => updateDayStatus(null)} disabled={isMonthClosed} tone="danger" />
            </View>

            <Pressable style={styles.secondaryButton} onPress={() => setStatusModalVisible(false)}>
              <Text style={styles.secondaryButtonText}>Kapat</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function LegendItem(props: { color: string; text: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: props.color }]} />
      <Text style={styles.legendText}>{props.text}</Text>
    </View>
  );
}

function SummaryCard(props: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function InfoRow(props: { label: string; value: string; strong?: boolean; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{props.label}</Text>
      <Text style={[styles.infoValue, props.strong ? styles.strong : null, props.valueColor ? { color: props.valueColor } : null]}>
        {props.value}
      </Text>
    </View>
  );
}

function ConsentCheck(props: { checked: boolean; onToggle: () => void; text: string }) {
  return (
    <Pressable style={styles.consentRow} onPress={props.onToggle}>
      <View style={[styles.consentBox, props.checked ? styles.consentBoxChecked : null]}>
        {props.checked ? <Text style={styles.consentTick}>âœ“</Text> : null}
      </View>
      <Text style={styles.consentText}>{props.text}</Text>
    </Pressable>
  );
}

function NumericInput(props: {
  value: number;
  onCommit: (value: string) => void;
  placeholder?: string;
  style?: object;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(props.value));
  const [error, setError] = useState("");

  useEffect(() => {
    setText(String(props.value));
  }, [props.value]);

  const updateText = (value: string) => {
    setText(value);
    setError("");
  };

  const commit = () => {
    const normalized = text.trim().replace(",", ".");
    if (!normalized) {
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(normalized)) {
      setError("GeÃ§erli sayÄ± girin.");
      return;
    }
    props.onCommit(normalized);
    setText(normalized);
  };

  const appendToken = (token: string) => {
    if (props.disabled) return;
    if (token === "clear") {
      setText("");
      setError("");
      return;
    }
    setText((prev) => `${prev}${token}`);
  };

  return (
    <View style={styles.numericField}>
      <TextInput
        value={text}
        onChangeText={updateText}
        onBlur={commit}
        keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
        style={[styles.input, props.style, props.disabled ? styles.inputDisabled : null]}
        placeholder={props.placeholder}
        editable={!props.disabled}
      />
      <View style={styles.quickKeyRow}>
        {[".", ",", "00"].map((item) => (
          <Pressable key={item} style={styles.quickKeyButton} onPress={() => appendToken(item)} disabled={props.disabled}>
            <Text style={styles.quickKeyText}>{item}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.quickKeyButton} onPress={() => appendToken("clear")} disabled={props.disabled}>
          <Text style={styles.quickKeyText}>Temizle</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function ModalButton(props: {
  title: string;
  onPress: () => void;
  disabled: boolean;
  tone: "primary" | "secondary" | "danger";
}) {
  const toneStyle =
    props.tone === "primary"
      ? styles.modalPrimary
      : props.tone === "danger"
        ? styles.modalDanger
        : styles.modalSecondary;

  return (
    <Pressable style={[styles.modalButton, toneStyle, props.disabled ? styles.buttonDisabled : null]} onPress={props.onPress} disabled={props.disabled}>
      <Text style={styles.modalButtonText}>{props.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  androidTopInset: {
    paddingTop: NativeStatusBar.currentHeight ?? 0
  },
  container: {
    flex: 1,
    backgroundColor: "#050816"
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050816"
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: "#050816"
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  headerInfoRow: {
    marginTop: 4
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1f2937",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center"
  },
  menuButtonText: {
    color: "#e2e8f0",
    fontSize: 20,
    fontWeight: "700"
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: "#f8fafc"
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: "#93c5fd"
  },
  saveText: {
    fontSize: 12,
    color: "#2dd4bf"
  },
  saveTextSlot: {
    marginTop: 4,
    minHeight: 16,
    justifyContent: "center"
  },
  saveTextHidden: {
    opacity: 0
  },
  content: {
    padding: 12,
    gap: 12,
    paddingBottom: 32
  },
  authContent: {
    padding: 14,
    gap: 12,
    paddingBottom: 36
  },
  authFooter: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    backgroundColor: "#050816"
  },
  authHeroCard: {
    backgroundColor: "#0f172a",
    borderRadius: 18,
    padding: 16,
    gap: 8
  },
  authBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#14b8a6",
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 12
  },
  authTitle: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "900"
  },
  authSubtitle: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 20
  },
  authTrustRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  authTrustItem: {
    flex: 1,
    minWidth: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f3b46",
    backgroundColor: "#0b2530",
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  authTrustValue: {
    color: "#67e8f9",
    fontSize: 15,
    fontWeight: "900"
  },
  authTrustLabel: {
    marginTop: 2,
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "700"
  },
  legalChip: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
    backgroundColor: "#111827"
  },
  legalChipText: {
    color: "#a5f3fc",
    fontSize: 12,
    fontWeight: "700"
  },
  authFormCard: {
    width: "100%",
    maxWidth: 1100,
    alignSelf: "center",
    backgroundColor: "#0b1220",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 12,
    gap: 10
  },
  authModeRow: {
    flexDirection: "row",
    gap: 8
  },
  authModeButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#111827"
  },
  authModeButtonActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e"
  },
  authModeButtonText: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "700"
  },
  authModeButtonTextActive: {
    color: "#ffffff"
  },
  primaryButton: {
    backgroundColor: "#0f766e",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14
  },
  section: {
    width: "100%",
    maxWidth: 1100,
    alignSelf: "center",
    backgroundColor: "#0b1220",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 12,
    gap: 10,
    overflow: "hidden"
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#f1f5f9"
  },
  monthHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  todayButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  todayButtonText: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 12
  },
  monthHeaderCenter: {
    flex: 1,
    alignItems: "center"
  },
  monthTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#f1f5f9"
  },
  monthRange: {
    marginTop: 2,
    fontSize: 13,
    color: "#94a3b8"
  },
  navCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center"
  },
  navCircleText: {
    fontSize: 25,
    color: "#f8fafc",
    marginTop: -1
  },
  calendarLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#475569"
  },
  legendText: {
    fontSize: 11,
    color: "#cbd5e1",
    fontWeight: "600"
  },
  calendarCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0f172a",
    overflow: "hidden"
  },
  weekHeaderRow: {
    flexDirection: "row",
    marginBottom: 6
  },
  weekLabel: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: "#94a3b8"
  },
  weekRow: {
    flexDirection: "row"
  },
  dayCell: {
    borderWidth: 0.5,
    borderColor: "#334155",
    paddingHorizontal: 5,
    paddingTop: 4,
    paddingBottom: 4,
    justifyContent: "space-between"
  },
  dayTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: "800",
    color: "#f8fafc"
  },
  dayStatusShort: {
    fontSize: 12,
    fontWeight: "800",
    color: "#f8fafc"
  },
  dayTime: {
    fontSize: 10,
    fontWeight: "700",
    color: "#e2e8f0"
  },
  dayTag: {
    fontSize: 9,
    color: "#cbd5e1",
    fontWeight: "700"
  },
  dimText: {
    color: "#9ca3af"
  },
  monthDiffBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#334155"
  },
  monthDiffValue: {
    fontWeight: "800",
    fontSize: 15,
    flexShrink: 1,
    textAlign: "right"
  },
  summaryCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#0f172a"
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#e2e8f0"
  },
  adminSessionRow: {
    gap: 6,
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 10,
    padding: 8,
    backgroundColor: "#111827"
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0b1220"
  },
  profileAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center"
  },
  profileAvatarFallbackText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff"
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 1,
    color: "#0f766e",
    textAlign: "center"
  },
  label: {
    fontSize: 13,
    color: "#cbd5e1",
    fontWeight: "700"
  },
  linkText: {
    fontSize: 12,
    color: "#0f766e",
    fontWeight: "700",
    textDecorationLine: "underline"
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#030712",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#f8fafc"
  },
  inputDisabled: {
    backgroundColor: "#1f2937",
    color: "#94a3b8"
  },
  numericField: {
    gap: 6
  },
  quickKeyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  quickKeyButton: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#111827"
  },
  quickKeyText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "800"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap"
  },
  flexInput: {
    flex: 1
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap"
  },
  infoLabel: {
    fontSize: 13,
    color: "#cbd5e1",
    flexShrink: 1
  },
  infoValue: {
    fontSize: 12,
    color: "#f1f5f9",
    textAlign: "right",
    flexShrink: 1
  },
  strong: {
    fontWeight: "800"
  },
  helper: {
    fontSize: 12,
    color: "#94a3b8"
  },
  closedBadge: {
    fontSize: 12,
    color: "#fecaca",
    fontWeight: "800",
    backgroundColor: "#3f0d0d",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    borderRadius: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  secondaryButton: {
    backgroundColor: "#1f2937",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 13
  },
  deleteButton: {
    alignSelf: "flex-start",
    backgroundColor: "#3f0d0d",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  deleteButtonText: {
    color: "#fecaca",
    fontWeight: "700",
    fontSize: 12
  },
  shiftText: {
    fontSize: 13,
    color: "#e2e8f0"
  },
  buttonDisabled: {
    opacity: 0.5
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  optionButton: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#111827"
  },
  optionButtonActive: {
    borderColor: "#0f766e",
    backgroundColor: "#0b3f3a"
  },
  optionButtonText: {
    fontSize: 12,
    color: "#cbd5e1",
    fontWeight: "700"
  },
  optionButtonTextActive: {
    color: "#0f766e"
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  consentBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#0b1220",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  consentBoxChecked: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e"
  },
  consentTick: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700"
  },
  consentText: {
    flex: 1,
    fontSize: 12,
    color: "#cbd5e1",
    lineHeight: 18
  },
  footer: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    backgroundColor: "#050816"
  },
  footerText: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: "92%",
    flexShrink: 1
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.66)",
    justifyContent: "flex-start"
  },
  drawerPanel: {
    width: "82%",
    maxWidth: 340,
    minHeight: "100%",
    backgroundColor: "#0b1220",
    borderRightWidth: 1,
    borderRightColor: "#1f2937",
    paddingTop: (NativeStatusBar.currentHeight ?? 0) + 16,
    paddingHorizontal: 14,
    paddingBottom: 24
  },
  drawerBrand: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "900"
  },
  drawerSub: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 11,
    lineHeight: 16
  },
  drawerItem: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#111827",
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  drawerItemText: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "700"
  },
  drawerExitItem: {
    marginTop: 18,
    borderColor: "#7f1d1d",
    backgroundColor: "#3f0d0d"
  },
  drawerExitText: {
    color: "#fecaca",
    fontSize: 14,
    fontWeight: "800"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 14,
    padding: 14,
    gap: 10
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f8fafc"
  },
  modalButtonGrid: {
    gap: 8
  },
  modalButton: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  modalPrimary: {
    backgroundColor: "#16a34a"
  },
  modalSecondary: {
    backgroundColor: "#2563eb"
  },
  modalDanger: {
    backgroundColor: "#dc2626"
  },
  modalButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14
  },
  workInfoBox: {
    borderWidth: 1,
    borderColor: "#1e3a8a",
    backgroundColor: "#0c1d3a",
    borderRadius: 10,
    padding: 8,
    gap: 4
  },
  workInfoText: {
    fontSize: 12,
    color: "#bfdbfe"
  },
  legalNote: {
    fontSize: 12,
    color: "#cbd5e1",
    lineHeight: 18
  },
  legalSectionCard: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#111827",
    padding: 10,
    gap: 8
  },
  legalWarning: {
    fontSize: 12,
    color: "#9a3412",
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fdba74",
    borderRadius: 10,
    padding: 10,
    lineHeight: 18
  },
  detailRowText: {
    fontSize: 12,
    color: "#cbd5e1",
    lineHeight: 18
  },
  error: {
    fontSize: 12,
    color: "#b91c1c",
    fontWeight: "700"
  }
});


