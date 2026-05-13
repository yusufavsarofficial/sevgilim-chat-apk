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
import { TranslationProvider, useTranslation } from "./src/contexts/TranslationContext";
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
  formatCurrency as formatCurrencyBase,
  formatDateKeyTr,
  formatSignedCurrency as formatSignedCurrencyBase,
  isIsoDate,
  isTrDate,
  isMonthKey,
  maskTrDateInput,
  monthLabelTr,
  monthlyDifferenceLabel,
  nextMonthKey,
  normalizeMonthPayment,
  normalizePaymentTransactions,
  normalizePayrollStatements,
  normalizeSalaryHistory,
  normalizeShiftTemplates,
  prevMonthKey,
  resolvePayrollSettingsForMonth,
  round2,
  safePositive,
  totalDifferenceForAllMonths,
  tryParseNumber
} from "./src/payroll";
import { loadAppData, saveAppData } from "./src/storage";
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
  adminPurgeUsers,
  adminRemoveIpBan,
  adminRevokeUserSessions,
  adminUnbanUser,
  getAppUpdateInfo,
  getApiBaseUrl,
  pingBackend,
  pullPayrollFromBackend,
  pushPayrollToBackend,
  remoteLogin,
  remoteGetSecurityQuestion,
  remoteLogout,
  remoteMe,
  remoteDeleteOwnAccount,
  remoteRegister,
  remoteResetPasswordWithSecurityAnswer,
  sendSecuritySignal,
  testBackendHealth
} from "./src/api";
import {
  AppData,
  AuthUser,
  DayRecord,
  DayStatus,
  EmployeeDocumentType,
  EmployeeNotification,
  EmployeeRequestStatus,
  EmployeeRequestType,
  LegalSettings,
  MonthPayment,
  PaymentTransaction,
  PayrollStatement,
  SalaryHistoryEntry,
  ShiftTemplate,
  ResignationTemplateKey,
  TerminationType
} from "./src/types";

type Tab = "CALENDAR" | "SUMMARY" | "EMPLOYEE" | "SETTINGS" | "SYNC" | "LEGAL" | "USERS" | "APP_SETTINGS" | "SUPPORT";
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
  | "nightPremiumRate"
  | "salaryPaymentDay"
  | "monthlyTarget";

const APP_LOGO = require("./assets/logo.png");
const WEEK_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const EVIDENCE_TYPE_OPTIONS: Array<{ value: AppData["evidenceFiles"][number]["type"]; label: string }> = [
  { value: "BORDRO", label: "Bordro" },
  { value: "DEKONT", label: "Dekont" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "VARDIYA", label: "Vardiya" },
  { value: "OTHER", label: "Diğer" }
];
const EMPLOYEE_REQUEST_TYPE_OPTIONS: Array<{ value: EmployeeRequestType; label: string }> = [
  { value: "LEAVE", label: "İzin" },
  { value: "ADVANCE", label: "Avans" },
  { value: "OVERTIME", label: "Mesai" },
  { value: "EXPENSE", label: "Masraf" },
  { value: "PROFILE", label: "Bilgi güncelleme" },
  { value: "OTHER", label: "Diğer" }
];
const EMPLOYEE_DOCUMENT_TYPE_OPTIONS: Array<{ value: EmployeeDocumentType; label: string }> = [
  { value: "IDENTITY", label: "Kimlik" },
  { value: "IBAN", label: "IBAN" },
  { value: "HEALTH", label: "Sağlık raporu" },
  { value: "CONTRACT", label: "Sözleşme" },
  { value: "CERTIFICATE", label: "Sertifika" },
  { value: "OTHER", label: "Diğer" }
];
const EMPLOYEE_REQUEST_STATUS_LABELS: Record<EmployeeRequestStatus, string> = {
  PENDING: "Onay bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal edildi"
};
const TERMINATION_TYPE_OPTIONS: Array<{ value: TerminationType; label: string }> = [
  { value: "EMPLOYER_TERMINATION", label: "İşveren feshi" },
  { value: "EMPLOYEE_RESIGNATION", label: "İstifa" },
  { value: "JUST_CAUSE_EMPLOYEE", label: "İşçi haklı fesih" },
  { value: "MUTUAL_AGREEMENT", label: "Karşılıklı anlaşma (ikale)" }
];

const GENEL_HATA = "İşlem gerçekleştirilemedi, lütfen tekrar deneyin.";
const MARKA_METNI = "AYFSOFT PTE & YUSUF AVŞAR Tüm Hakları Saklıdır";
const HUKUK_UYARI_METNI =
  "Bu uygulamadaki bilgiler ve hesaplamalar bilgilendirme amaçlıdır. Resmî hukuki danışmanlık yerine geçmez. Nihai işlem öncesinde yetkili kurum veya hukuk uzmanından destek alınmalıdır.";
const MEAL_TRANSPORT_METHOD_OPTIONS: Array<{ value: "WORKED_ONLY" | "WORKED_AND_ANNUAL" | "PAYABLE_ALL"; label: string }> = [
  { value: "WORKED_ONLY", label: "Sadece fiili çalışılan günler" },
  { value: "WORKED_AND_ANNUAL", label: "Çalışılan + yıllık izin" },
  { value: "PAYABLE_ALL", label: "Tüm ödenebilir günler" }
];
const LETTER_TEMPLATE_OPTIONS: Array<{ value: ResignationTemplateKey; label: string }> = [
  { value: "STANDARD", label: "1. Standart istifa dilekçesi" },
  { value: "NOTICE_WITH", label: "2. İhbar süreli istifa dilekçesi" },
  { value: "NOTICE_WITHOUT", label: "3. İhbar süresiz istifa dilekçesi" },
  { value: "PROBATION", label: "4. Deneme süresinde istifa dilekçesi" },
  { value: "RETIREMENT", label: "5. Emeklilik nedeniyle ayrılış dilekçesi" },
  { value: "MILITARY", label: "6. Askerlik nedeniyle ayrılış dilekçesi" },
  { value: "MARRIAGE", label: "7. Evlilik nedeniyle ayrılış dilekçesi" },
  { value: "HEALTH", label: "8. Sağlık nedeniyle haklı fesih dilekçesi" },
  { value: "SALARY_UNPAID", label: "9. Maaş ödenmemesi nedeniyle haklı fesih dilekçesi" },
  { value: "OVERTIME_UNPAID", label: "10. Fazla mesai ödenmemesi nedeniyle haklı fesih dilekçesi" },
  { value: "MOBBING", label: "11. Mobbing nedeniyle haklı fesih dilekçesi" },
  { value: "WORK_CONDITION_CHANGE", label: "12. İş şartlarının esaslı değişmesi nedeniyle fesih dilekçesi" },
  { value: "OHS_VIOLATION", label: "13. İSG ihlali nedeniyle haklı fesih dilekçesi" },
  { value: "SGK_PREMIUM_MISSING", label: "14. SGK primi eksik yatırılması nedeniyle haklı fesih dilekçesi" },
  { value: "ANNUAL_LEAVE_DENIED", label: "15. Yıllık izin kullandırılmaması nedeniyle başvuru/fesih dilekçesi" }
];

const LEGAL_SECTIONS: Array<{ id: string; title: string; content: string }> = [
  {
    id: "kvkk",
    title: "KVKK Aydınlatma Metni",
    content:
      "AYFSOFT, puantaj ve maaş hesaplama hizmetini sunarken kimlik bilgileri, çalışma kayıtları, izin/mesai verileri ve oturum güvenliği kayıtlarını veri minimizasyonu ilkesiyle işler. İşleme amacı; hizmetin sunulması, mevzuat yükümlülüklerinin yerine getirilmesi, bilgi güvenliğinin sağlanması ve kullanıcı taleplerinin yönetimidir. Veriler yalnızca yetkili kişilerce erişilebilir şekilde saklanır; saklama süresi dolan veya işleme amacı ortadan kalkan veriler silinir, yok edilir veya anonim hale getirilir. Kullanıcı, KVKK 11. madde kapsamındaki tüm haklarını kullanabilir."
  },
  {
    id: "acik-riza",
    title: "Açık Rıza Metni",
    content:
      "Kullanıcı; uygulamada yer alan kişisel veri işleme süreçleri, cihaz verisi kullanımı, güvenlik kayıtları ve hukuki bilgilendirme metinleri hakkında aydınlatıldığını kabul eder. Açık rıza, özgür iradeyle ve bilgilendirmeye dayalı olarak verilir; kullanıcı dilediği zaman ilgili başvuru kanalları üzerinden rızasını geri çekebilir. Rızanın geri çekilmesi, geri çekme tarihine kadar yapılan işlemleri hukuka aykırı hale getirmez."
  },
  {
    id: "gizlilik",
    title: "Gizlilik Politikası",
    content:
      "Uygulama verileri yetkisiz erişim, ifşa, değiştirme ve kayba karşı teknik ve idari tedbirlerle korunur. Kimlik doğrulama, oturum yönetimi, oran sınırlama, erişim denetimi ve kayıt mekanizmaları güvenlik çerçevesinin parçasıdır. Kullanıcı verileri ticari amaçla üçüncü taraflara satılmaz. Yasal zorunluluk veya resmi merci talebi dışında paylaşım yapılmaz."
  },
  {
    id: "gizlilik-guvence",
    title: "Gizlilik ve Güvenlik Taahhüdü",
    content:
      "Puantaj, bordro, belge, IBAN, acil kişi ve iletişim verileri yalnızca uygulamanın çalışma, hesaplama, yedekleme, destek ve güvenlik amaçları için kullanılır. Admin işlemleri denetim kayıtlarına işlenir; kullanıcı verisi görüntüleme, silme, banlama ve oturum sonlandırma gibi işlemler yetki kontrolüne tabidir. Kullanıcı, hesabının silinmesini veya hatalı verinin düzeltilmesini talep edebilir; mevzuaten saklanması gerekmeyen veriler güvenli şekilde kaldırılır."
  },
  {
    id: "cerez",
    title: "Çerez Politikası",
    content:
      "Uygulama, oturum sürekliliği ve güvenlik için teknik çerez benzeri işaretleyiciler kullanabilir. Bu bileşenler reklam amaçlı değil, yalnızca hizmetin güvenli çalışması ve kullanıcı deneyiminin sürdürülebilmesi için kullanılır. Zorunlu olmayan kullanım senaryoları devreye alınırsa kullanıcı ayrıca bilgilendirilir."
  },
  {
    id: "cihaz",
    title: "Cihaz Verisi Politikası",
    content:
      "Cihaz modeli, işletim sistemi sürümü, uygulama sürümü ve güvenlik sinyalleri (ör. emülatör/gerçek cihaz bilgisi) yalnızca güvenlik, hata teşhisi ve hizmet kalitesi amaçlarıyla işlenir. Bu veriler, kullanıcıyı teknik risklerden korumak ve hizmet sürekliliğini sağlamak için kullanılır."
  },
  {
    id: "kullanim-sartlari",
    title: "Kullanım Şartları",
    content:
      "Uygulama çıktıları bilgilendirme ve takip amaçlıdır. Resmî bordro, iş sözleşmesi, şirket içi kayıtlar ve ilgili mevzuat önceliklidir. Kullanıcı, girdiği bilgilerin doğruluğundan sorumludur. Uygulama verilerinin eksik veya hatalı girilmesi halinde oluşabilecek sonuçlardan kullanıcı sorumludur."
  },
  {
    id: "yasal-sorumluluk",
    title: "Yasal Sorumluluk Reddi",
    content:
      "Uygulamadaki hesaplamalar genel formüller üzerinden yapılır ve her işyeri sözleşme şartı için bire bir sonuç garantisi vermez. İş hukuku uyuşmazlıklarında avukat, mali müşavir veya yetkili kurum görüşü esas alınmalıdır. Uygulama hiçbir durumda resmî hukuki mütalaa yerine geçmez."
  },
  {
    id: "veri-saklama",
    title: "Veri Saklama",
    content:
      "Kişisel veriler işleme amacı ve yasal saklama süreleri boyunca tutulur. Süre sonunda veriler güvenli şekilde imha edilir veya anonim hale getirilir. Yedekleme, bütünlük kontrolü ve erişim kayıtları düzenli güvenlik kontrolleriyle yönetilir."
  },
  {
    id: "veri-silme",
    title: "Veri Silme",
    content:
      "Kullanıcı, hesabı veya verileri için silme talebi iletebilir. Talep mevzuata uygun olarak değerlendirilir; saklama zorunluluğu bulunmayan veriler silinir. Silme işlemi tamamlandığında kullanıcıya bilgilendirme yapılır."
  },
  {
    id: "kullanici-haklari",
    title: "Kullanıcı Hakları",
    content:
      "Kullanıcı; veriye erişim, düzeltme, silme, işleme kısıtlama, itiraz, taşınabilirlik ve bilgi talebi haklarını kullanabilir. Başvurular kimlik doğrulaması sonrası makul sürede cevaplanır. Uyuşmazlık halinde ilgili denetim kurumlarına başvuru hakkı saklıdır."
  },
  {
    id: "is-hukuku",
    title: "İş Hukuku Bilgilendirmesi",
    content:
      "Puantaj, fazla mesai, hafta tatili ve UBGT değerlendirmesi yapılırken iş sözleşmesi, toplu iş sözleşmesi, şirket iç düzenlemeleri ve güncel mevzuat birlikte yorumlanmalıdır. Bu uygulama yalnızca bilgilendirme amacıyla hesap üretir; resmî bordro, işveren kayıtları ve yetkili kurum kararları esastır."
  },
  {
    id: "kidem",
    title: "Kıdem Tazminatı Bilgilendirmesi",
    content:
      "Kıdem tazminatı değerlendirmesi 1475 sayılı Kanun m.14 esas alınarak hizmet süresi, brüt ücret, düzenli yan haklar ve güncel kıdem tavanı dikkate alınarak yapılır. Hesaplama sonucu tahmin niteliğindedir; nihai ödeme işveren bordrosu, SGK kayıtları ve hukuki inceleme ile kesinleşir."
  },
  {
    id: "ihbar",
    title: "İhbar Tazminatı Bilgilendirmesi",
    content:
      "İhbar süreleri 4857 sayılı İş Kanunu m.17 kapsamında hesaplanır: 6 aydan az 2 hafta (14 gün), 6 ay-1.5 yıl 4 hafta (28 gün), 1.5 yıl-3 yıl 6 hafta (42 gün), 3 yıldan fazla 8 hafta (56 gün). Uygulama bu süreler üzerinden tahmini ihbar bedeli üretir."
  },
  {
    id: "istifa",
    title: "İstifa Süreçleri",
    content:
      "İstifa sürecinde tarih, gerekçe ve teslim biçimi önemlidir. Haklı fesih, askerlik, evlilik, mobbing veya ücretin ödenmemesi gibi nedenlerde mevzuata uygun belge ve bildirim düzeni izlenmelidir. Uygulama, dilekçe taslakları sunar; nihai metin somut olaya göre uzman desteğiyle kontrol edilmelidir."
  },
  {
    id: "istifa-kontrol-listesi",
    title: "İstifa ve Fesih Kontrol Listesi",
    content:
      "Dilekçe hazırlanırken işe giriş tarihi, ayrılış tarihi, bildirim tarihi, çalışma yeri, departman, imza, teslim kanalı ve varsa haklı fesih gerekçesini destekleyen belgeler birlikte kontrol edilmelidir. İhbar süresi, kıdem hakkı, kullanılmayan izin, fazla mesai, ücret alacağı, SGK primi ve yan haklar ayrı ayrı değerlendirilmelidir. İşleme başlamadan önce dilekçenin bir örneği saklanmalı ve teslim alındı bilgisi belgelenmelidir."
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

  const paidByMonth: Record<string, MonthPayment> = {};
  if (data.paidByMonth && typeof data.paidByMonth === "object") {
    for (const [key, value] of Object.entries(data.paidByMonth)) {
      if (isMonthKey(key)) {
        paidByMonth[key] = normalizeMonthPayment(value);
      }
    }
  }

  return {
    ...DEFAULT_DATA,
    ...data,
    settings: {
      ...DEFAULT_DATA.settings,
      ...data.settings,
      monthlySalary: safePositive(tryParseNumber(String(data.settings?.monthlySalary ?? DEFAULT_DATA.settings.monthlySalary))),
      monthlyBaseHours: safePositive(tryParseNumber(String(data.settings?.monthlyBaseHours ?? DEFAULT_DATA.settings.monthlyBaseHours))),
      weeklyOvertimeThresholdHours: safePositive(
        tryParseNumber(String(data.settings?.weeklyOvertimeThresholdHours ?? DEFAULT_DATA.settings.weeklyOvertimeThresholdHours))
      ),
      dailyOvertimeThresholdHours: safePositive(
        tryParseNumber(String(data.settings?.dailyOvertimeThresholdHours ?? DEFAULT_DATA.settings.dailyOvertimeThresholdHours))
      ),
      defaultShiftHours: safePositive(tryParseNumber(String(data.settings?.defaultShiftHours ?? DEFAULT_DATA.settings.defaultShiftHours))),
      defaultOvertimeHours: safePositive(
        tryParseNumber(String(data.settings?.defaultOvertimeHours ?? DEFAULT_DATA.settings.defaultOvertimeHours))
      ),
      monthlyMealAllowance: safePositive(
        tryParseNumber(String(data.settings?.monthlyMealAllowance ?? DEFAULT_DATA.settings.monthlyMealAllowance))
      ),
      monthlyTransportAllowance: safePositive(
        tryParseNumber(String(data.settings?.monthlyTransportAllowance ?? DEFAULT_DATA.settings.monthlyTransportAllowance))
      ),
      nightPremiumRate: safePositive(tryParseNumber(String(data.settings?.nightPremiumRate ?? DEFAULT_DATA.settings.nightPremiumRate))),
      salaryPaymentDay: safePositive(tryParseNumber(String(data.settings?.salaryPaymentDay ?? DEFAULT_DATA.settings.salaryPaymentDay))),
      monthlyTarget: safePositive(tryParseNumber(String(data.settings?.monthlyTarget ?? DEFAULT_DATA.settings.monthlyTarget))),
      coefficients: {
        overtime: safePositive(
          tryParseNumber(String(data.settings?.coefficients?.overtime ?? DEFAULT_DATA.settings.coefficients.overtime))
        ),
        sunday: safePositive(tryParseNumber(String(data.settings?.coefficients?.sunday ?? DEFAULT_DATA.settings.coefficients.sunday))),
        holiday: safePositive(
          tryParseNumber(String(data.settings?.coefficients?.holiday ?? DEFAULT_DATA.settings.coefficients.holiday))
        ),
        ubgt: safePositive(tryParseNumber(String(data.settings?.coefficients?.ubgt ?? DEFAULT_DATA.settings.coefficients.ubgt)))
      }
    },
    salaryHistory: normalizeSalaryHistory(
      Array.isArray((data as { salaryHistory?: SalaryHistoryEntry[] }).salaryHistory)
        ? (data as { salaryHistory?: SalaryHistoryEntry[] }).salaryHistory
        : [],
      data.settings ? { ...DEFAULT_DATA.settings, ...data.settings } : DEFAULT_DATA.settings
    ),
    paymentTransactions: normalizePaymentTransactions((data as { paymentTransactions?: PaymentTransaction[] }).paymentTransactions),
    payrollStatements: normalizePayrollStatements((data as { payrollStatements?: PayrollStatement[] }).payrollStatements),
    shiftTemplates: normalizeShiftTemplates((data as { shiftTemplates?: ShiftTemplate[] }).shiftTemplates),
    evidenceFiles: Array.isArray((data as { evidenceFiles?: AppData["evidenceFiles"] }).evidenceFiles)
      ? ((data as { evidenceFiles?: AppData["evidenceFiles"] }).evidenceFiles ?? [])
      : [],
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
    employeePortal: {
      ...DEFAULT_DATA.employeePortal,
      ...((data as Partial<AppData>).employeePortal ?? {}),
      requests: Array.isArray((data as Partial<AppData>).employeePortal?.requests)
        ? ((data as Partial<AppData>).employeePortal?.requests ?? [])
        : [],
      documents: Array.isArray((data as Partial<AppData>).employeePortal?.documents)
        ? ((data as Partial<AppData>).employeePortal?.documents ?? [])
        : [],
      notifications: Array.isArray((data as Partial<AppData>).employeePortal?.notifications)
        ? ((data as Partial<AppData>).employeePortal?.notifications ?? [])
        : DEFAULT_DATA.employeePortal.notifications
    },
    dayRecords: data.dayRecords ?? {},
    paidByMonth,
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

const LanguageSelector: React.FC = () => {
  const { language, setLanguage, t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);

  const languages = [
    { code: 'tr' as const, name: 'Türkçe', flag: '🇹🇷' },
    { code: 'th' as const, name: 'ไทย', flag: '🇹🇭' },
  ];

  const currentLang = languages.find(l => l.code === language);

  return (
    <View style={styles.languageSelector}>
      <Pressable
        style={styles.languageButton}
        onPress={() => setShowPicker(!showPicker)}
      >
        <Text style={styles.languageButtonText}>
          {currentLang?.flag} {currentLang?.name}
        </Text>
      </Pressable>

      {showPicker && (
        <View style={styles.languagePicker}>
          {languages.map(lang => (
            <Pressable
              key={lang.code}
              style={[
                styles.languageOption,
                language === lang.code && styles.languageOptionSelected
              ]}
              onPress={() => {
                setLanguage(lang.code);
                setShowPicker(false);
              }}
            >
              <Text style={styles.languageOptionText}>
                {lang.flag} {lang.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

export default function App() {
  return (
    <TranslationProvider>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </TranslationProvider>
  );
}

function AppContent() {
  const { language } = useTranslation();
  const formatCurrency = (value: number) => formatCurrencyBase(value, language);
  const formatSignedCurrency = (value: number) => formatSignedCurrencyBase(value, language);
  const [appData, setAppData] = useState<AppData>(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"USER_LOGIN" | "USER_REGISTER" | "FORGOT_PASSWORD">("USER_LOGIN");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSource, setAuthSource] = useState<"REMOTE" | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authInviteKey, setAuthInviteKey] = useState("");
  const [authSecurityQuestion, setAuthSecurityQuestion] = useState("");
  const [authSecurityAnswer, setAuthSecurityAnswer] = useState("");
  const [authResetNewPassword, setAuthResetNewPassword] = useState("");
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deleteAccountSecurityAnswer, setDeleteAccountSecurityAnswer] = useState("");
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
  const [adminIpReason, setAdminIpReason] = useState("Güvenlik ihlali");
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
  const [paymentForm, setPaymentForm] = useState({ date: "", kind: "BANK", amount: "", description: "" });
  const [statementForm, setStatementForm] = useState({
    bordroNetSalary: "",
    bordroOvertime: "",
    bordroSunday: "",
    bordroUbgt: "",
    bordroMeal: "",
    bordroTransport: "",
    bankPaid: "",
    cashPaid: "",
    advanceDeduction: "",
    note: ""
  });
  const [shiftTemplateForm, setShiftTemplateForm] = useState({
    name: "",
    start: "09:00",
    end: "18:00",
    breakMinutes: "60",
    totalHours: "8",
    manualOvertimeHours: "0",
    note: ""
  });
  const [evidenceForm, setEvidenceForm] = useState({ title: "", type: "BORDRO", uri: "", note: "" });
  const [employeeRequestForm, setEmployeeRequestForm] = useState({
    type: "LEAVE" as EmployeeRequestType,
    title: "",
    startDate: "",
    endDate: "",
    amount: "",
    hours: "",
    note: ""
  });
  const [employeeDocumentForm, setEmployeeDocumentForm] = useState({
    title: "",
    type: "IDENTITY" as EmployeeDocumentType,
    uri: "",
    note: ""
  });
  const [salaryHistoryEditingId, setSalaryHistoryEditingId] = useState<string | null>(null);
  const [salaryHistoryForm, setSalaryHistoryForm] = useState({
    startMonth: currentMonthKey(),
    endMonth: "",
    monthlySalary: "",
    monthlyBaseHours: "225",
    weeklyOvertimeThresholdHours: "45",
    dailyOvertimeThresholdHours: "7.5",
    monthlyMealAllowance: "",
    monthlyTransportAllowance: "",
    overtimeCoefficient: "1.5",
    sundayCoefficient: "1.5",
    ubgtCoefficient: "1",
    note: ""
  });

  const [holidayInput, setHolidayInput] = useState("");
  const [paymentInputs, setPaymentInputs] = useState<Record<PaymentField, string>>(
    paidInputFromPayment({ salary: 0, overtime: 0, sunday: 0, ubgt: 0, meal: 0, transport: 0 })
  );
  const [focusedPaymentField, setFocusedPaymentField] = useState<PaymentField | null>(null);
  const saveDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequenceRef = useRef(0);
  const usernameInputRef = useRef<TextInput | null>(null);
  const passwordInputRef = useRef<TextInput | null>(null);
  const inviteKeyInputRef = useRef<TextInput | null>(null);
  const updateAlertShownRef = useRef(false);

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
      const backendOk = await pingBackend().catch(() => false);
      if (mounted) {
        setBackendConnected(backendOk);
      }

      const remoteSession = await remoteMe().catch(() => null);
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
      // Local/offline auth is disabled (client must not contain admin/invite secrets).
      if (mounted) {
        setLoaded(true);
      }
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
    if (!loaded || updateAlertShownRef.current) {
      return;
    }
    updateAlertShownRef.current = true;
    getAppUpdateInfo()
      .then((update) => {
        if (!update || !update.apkUrl) {
          return;
        }
        Alert.alert(
          update.required ? "Zorunlu güncelleme var" : "Yeni güncelleme var",
          `${update.version ? `Sürüm: ${update.version}\n` : ""}${update.message || "Yeni APK dosyası hazır."}`,
          [
            { text: update.required ? "Tamam" : "Daha sonra", style: "cancel" },
            {
              text: "APK Aç",
              onPress: () => {
                const url = update.apkUrl.startsWith("http") ? update.apkUrl : `${getApiBaseUrl()}${update.apkUrl}`;
                Linking.openURL(url).catch(() => {
                  Alert.alert("Güncelleme", "APK bağlantısı açılamadı.");
                });
              }
            }
          ]
        );
      })
      .catch(() => {});
  }, [loaded]);

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

  const persistUserDataNow = async () => {
    if (!authUser) {
      return;
    }
    setSaving(true);
    try {
      await saveAppData(appData, authUser.id);
      if (authSource === "REMOTE") {
        await pushPayrollToBackend(appData);
        setBackendConnected(true);
      }
    } catch {
      if (authSource === "REMOTE") {
        setBackendConnected(false);
      }
      throw new Error("Değişiklikler kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const effectiveSettings = useMemo(
    () => resolvePayrollSettingsForMonth(appData.settings, appData.salaryHistory, monthKey),
    [appData.salaryHistory, appData.settings, monthKey]
  );
  const activeSalaryHistoryEntry = useMemo(() => {
    return [...appData.salaryHistory]
      .filter((entry) => entry.startMonth <= monthKey && (!entry.endMonth || entry.endMonth >= monthKey))
      .sort((a, b) => b.startMonth.localeCompare(a.startMonth))[0] ?? null;
  }, [appData.salaryHistory, monthKey]);
  const currentMonthTransactions = useMemo(
    () => appData.paymentTransactions.filter((item) => item.monthKey === monthKey).sort((a, b) => a.date.localeCompare(b.date)),
    [appData.paymentTransactions, monthKey]
  );
  const currentMonthStatement = useMemo(
    () => appData.payrollStatements.find((item) => item.monthKey === monthKey) ?? null,
    [appData.payrollStatements, monthKey]
  );
  const currentMonthEvidence = useMemo(
    () => appData.evidenceFiles.filter((item) => item.monthKey === monthKey),
    [appData.evidenceFiles, monthKey]
  );
  const employeeRequests = useMemo(
    () => [...appData.employeePortal.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [appData.employeePortal.requests]
  );
  const unreadEmployeeNotifications = useMemo(
    () => appData.employeePortal.notifications.filter((item) => !item.read).length,
    [appData.employeePortal.notifications]
  );
  const currentMonthMissingDays = useMemo(() => {
    if (!isMonthKey(monthKey)) {
      return [];
    }
    const [yearStr, monthStr] = monthKey.split("-");
    const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
    const missing: string[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${monthKey}-${`${day}`.padStart(2, "0")}`;
      const record = appData.dayRecords[dateKey];
      if (!record || record.status === null) {
        missing.push(dateKey);
      }
    }
    return missing;
  }, [appData.dayRecords, monthKey]);

  const summary = useMemo(() => {
    return calculateMonthlySummary(
      appData.dayRecords,
      effectiveSettings,
      appData.paidByMonth,
      monthKey,
      appData.holidayDates,
      appData.halfHolidayDates,
      appData.paymentTransactions,
      appData.payrollStatements
    );
  }, [appData.dayRecords, appData.halfHolidayDates, appData.holidayDates, appData.paidByMonth, appData.paymentTransactions, appData.payrollStatements, effectiveSettings, monthKey]);

  useEffect(() => {
    if (focusedPaymentField) {
      return;
    }
    setPaymentInputs(paidInputFromPayment(summary.paid));
  }, [focusedPaymentField, monthKey, summary.paid]);

  const monthGrid = useMemo(() => buildMonthGrid(monthKey), [monthKey]);
  const totalDifference = useMemo(() => totalDifferenceForAllMonths(appData), [appData]);
  const legalResult = useMemo(() => calculateLegalResult(appData.legal), [appData.legal]);
  const employeeHealthChecks = useMemo(() => {
    const checks: Array<{ label: string; value: string; tone: "OK" | "WARN" | "DANGER" }> = [];
    checks.push({
      label: "Ay puantaj durumu",
      value:
        currentMonthMissingDays.length === 0
          ? "Eksik gün yok"
          : `${currentMonthMissingDays.length} gün işlenmemiş`,
      tone: currentMonthMissingDays.length === 0 ? "OK" : "WARN"
    });
    checks.push({
      label: "Maaş ayarı",
      value: summary.salaryConfigured ? `${formatCurrency(summary.hourlyRate)} / saat` : "Maaş veya baz saat eksik",
      tone: summary.salaryConfigured ? "OK" : "DANGER"
    });
    checks.push({
      label: "Ödeme kontrolü",
      value:
        summary.paidTotal > 0
          ? `${monthlyDifferenceLabel(summary.difference)} ${formatSignedCurrency(summary.difference)}`
          : "Bu ay ödeme girişi yok",
      tone: summary.paidTotal > 0 ? (summary.difference < 0 ? "DANGER" : "OK") : "WARN"
    });
    checks.push({
      label: "Yan hak",
      value: `${summary.mealEntitledDays} gün yemek, ${summary.transportEntitledDays} gün yol`,
      tone: "OK"
    });
    return checks;
  }, [currentMonthMissingDays.length, formatCurrency, formatSignedCurrency, summary]);
  const analytics = useMemo(() => {
    return calculateMonthlyAnalytics(appData.dayRecords, effectiveSettings, monthKey, appData.holidayDates, summary);
  }, [appData.dayRecords, appData.holidayDates, effectiveSettings, monthKey, summary]);
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
      ? "İşe giriş tarihi 01.01.2025 formatında olmalıdır."
      : appData.legal.terminationDate && !isTrDate(appData.legal.terminationDate)
        ? "İşten çıkış tarihi 01.01.2026 formatında olmalıdır."
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
          selectedDayRecord.work?.totalHours ?? effectiveSettings.defaultShiftHours,
          effectiveSettings,
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
    setDayEditStart(record.work?.start ?? effectiveSettings.defaultShiftStart);
    setDayEditEnd(record.work?.end ?? effectiveSettings.defaultShiftEnd);
    setDayEditTotalHours(String(record.work?.totalHours ?? effectiveSettings.defaultShiftHours));
    setDayEditBreakMinutes(String(record.work?.breakMinutes ?? 0));
    setDayEditManualOvertime(
      record.work?.manualOvertimeOverrideHours === undefined ? "" : String(record.work.manualOvertimeOverrideHours)
    );
    setDayEditNote(record.note ?? "");
  }, [appData.dayRecords, effectiveSettings, selectedDateKey, statusModalVisible]);

  useEffect(() => {
    if (!currentMonthStatement) {
      setStatementForm({
        bordroNetSalary: "",
        bordroOvertime: "",
        bordroSunday: "",
        bordroUbgt: "",
        bordroMeal: "",
        bordroTransport: "",
        bankPaid: "",
        cashPaid: "",
        advanceDeduction: "",
        note: ""
      });
      return;
    }
    setStatementForm({
      bordroNetSalary: String(currentMonthStatement.bordroNetSalary),
      bordroOvertime: String(currentMonthStatement.bordroOvertime),
      bordroSunday: String(currentMonthStatement.bordroSunday),
      bordroUbgt: String(currentMonthStatement.bordroUbgt),
      bordroMeal: String(currentMonthStatement.bordroMeal),
      bordroTransport: String(currentMonthStatement.bordroTransport),
      bankPaid: String(currentMonthStatement.bankPaid),
      cashPaid: String(currentMonthStatement.cashPaid),
      advanceDeduction: String(currentMonthStatement.advanceDeduction),
      note: currentMonthStatement.note
    });
  }, [currentMonthStatement]);

  const updateMonthPaymentInput = (field: PaymentField, value: string) => {
    setPaymentInputs((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const buildPaymentFromInputs = (): MonthPayment => ({
    salary: safePositive(tryParseNumber(paymentInputs.salary)),
    overtime: safePositive(tryParseNumber(paymentInputs.overtime)),
    sunday: safePositive(tryParseNumber(paymentInputs.sunday)),
    ubgt: safePositive(tryParseNumber(paymentInputs.ubgt)),
    meal: safePositive(tryParseNumber(paymentInputs.meal)),
    transport: safePositive(tryParseNumber(paymentInputs.transport))
  });

  const commitMonthPayment = (showConfirmation = false) => {
    if (!isMonthKey(monthKey)) {
      Alert.alert("Ay formatı hatalı", "Ay bilgisi YYYY-MM olmalı.");
      return;
    }
    if (isMonthClosed) {
      Alert.alert("Ay kapalı", "Bu ay kapalı olduğu için ödeme değiştirilemez.");
      return;
    }

    const payment = buildPaymentFromInputs();
    setFocusedPaymentField(null);
    setPaymentInputs(paidInputFromPayment(payment));

    setAppData((prev) => ({
      ...prev,
      paidByMonth: {
        ...prev.paidByMonth,
        [monthKey]: payment
      }
    }));
    if (showConfirmation) {
      Alert.alert("Kaydedildi", "Ödeme bilgileri kaydedildi.");
    }
  };

  const saveMonthPayment = () => commitMonthPayment(true);

  const addPaymentTransaction = () => {
    const amount = safePositive(tryParseNumber(paymentForm.amount));
    if (amount <= 0) {
      Alert.alert("Tutar eksik", "Ödeme tutarı girin.");
      return;
    }
    const date = isIsoDate(paymentForm.date) ? paymentForm.date : `${monthKey}-01`;
    setAppData((prev) => ({
      ...prev,
      paymentTransactions: [
        ...prev.paymentTransactions,
        {
          id: `payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          monthKey,
          date,
          kind: paymentForm.kind as PaymentTransaction["kind"],
          amount,
          description: paymentForm.description.trim()
        }
      ]
    }));
    setPaymentForm({ date: "", kind: "BANK", amount: "", description: "" });
  };

  const deletePaymentTransaction = (id: string) => {
    setAppData((prev) => ({
      ...prev,
      paymentTransactions: prev.paymentTransactions.filter((item) => item.id !== id)
    }));
  };

  const savePayrollStatement = () => {
    const statement: PayrollStatement = {
      id: `statement-${monthKey}`,
      monthKey,
      bordroNetSalary: safePositive(tryParseNumber(statementForm.bordroNetSalary)),
      bordroOvertime: safePositive(tryParseNumber(statementForm.bordroOvertime)),
      bordroSunday: safePositive(tryParseNumber(statementForm.bordroSunday)),
      bordroUbgt: safePositive(tryParseNumber(statementForm.bordroUbgt)),
      bordroMeal: safePositive(tryParseNumber(statementForm.bordroMeal)),
      bordroTransport: safePositive(tryParseNumber(statementForm.bordroTransport)),
      bankPaid: safePositive(tryParseNumber(statementForm.bankPaid)),
      cashPaid: safePositive(tryParseNumber(statementForm.cashPaid)),
      advanceDeduction: safePositive(tryParseNumber(statementForm.advanceDeduction)),
      note: statementForm.note.trim()
    };
    setAppData((prev) => ({
      ...prev,
      payrollStatements: [
        ...prev.payrollStatements.filter((item) => item.monthKey !== monthKey),
        statement
      ]
    }));
  };

  const addShiftTemplate = () => {
    if (!shiftTemplateForm.name.trim()) {
      Alert.alert("Şablon adı eksik", "Vardiya şablonu için ad girin.");
      return;
    }
    setAppData((prev) => ({
      ...prev,
      shiftTemplates: [
        ...prev.shiftTemplates,
        {
          id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: shiftTemplateForm.name.trim(),
          start: shiftTemplateForm.start.trim() || effectiveSettings.defaultShiftStart,
          end: shiftTemplateForm.end.trim() || effectiveSettings.defaultShiftEnd,
          breakMinutes: safePositive(tryParseNumber(shiftTemplateForm.breakMinutes)),
          totalHours: safePositive(tryParseNumber(shiftTemplateForm.totalHours)),
          manualOvertimeHours: safePositive(tryParseNumber(shiftTemplateForm.manualOvertimeHours)),
          note: shiftTemplateForm.note.trim()
        }
      ]
    }));
    setShiftTemplateForm({ name: "", start: "09:00", end: "18:00", breakMinutes: "60", totalHours: "8", manualOvertimeHours: "0", note: "" });
  };

  const applyShiftTemplateToSelectedDay = (template: ShiftTemplate) => {
    if (!selectedDateKey) {
      return;
    }
    setAppData((prev) => ({
      ...prev,
      dayRecords: {
        ...prev.dayRecords,
        [selectedDateKey]: {
          dateKey: selectedDateKey,
          status: "WORKED",
          isManual: true,
          work: {
            start: template.start,
            end: template.end,
            totalHours: template.totalHours,
            breakMinutes: template.breakMinutes,
            manualOvertimeOverrideHours: template.manualOvertimeHours || undefined
          },
          note: template.note,
          updatedAt: new Date().toISOString()
        }
      }
    }));
  };

  const addEvidenceFile = () => {
    if (!evidenceForm.title.trim()) {
      Alert.alert("Belge adı eksik", "Delil/belge için başlık girin.");
      return;
    }
    setAppData((prev) => ({
      ...prev,
      evidenceFiles: [
        ...prev.evidenceFiles,
        {
          id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          monthKey,
          title: evidenceForm.title.trim(),
          type: evidenceForm.type as AppData["evidenceFiles"][number]["type"],
          uri: evidenceForm.uri.trim(),
          note: evidenceForm.note.trim(),
          createdAt: new Date().toISOString()
        }
      ]
    }));
    setEvidenceForm({ title: "", type: "BORDRO", uri: "", note: "" });
  };

  const pushEmployeeNotification = (
    title: string,
    message: string,
    tone: AppData["employeePortal"]["notifications"][number]["tone"] = "INFO"
  ) => {
    setAppData((prev) => ({
      ...prev,
      employeePortal: {
        ...prev.employeePortal,
        notifications: [
          {
            id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title,
            message,
            tone,
            read: false,
            createdAt: new Date().toISOString()
          },
          ...prev.employeePortal.notifications
        ].slice(0, 50)
      }
    }));
  };

  const addEmployeeRequest = () => {
    const title = employeeRequestForm.title.trim() || EMPLOYEE_REQUEST_TYPE_OPTIONS.find((item) => item.value === employeeRequestForm.type)?.label || "Talep";
    if (!employeeRequestForm.note.trim() && employeeRequestForm.type !== "ADVANCE") {
      Alert.alert("Açıklama eksik", "Talebin değerlendirilebilmesi için kısa bir açıklama yazın.");
      return;
    }
    const startDate = employeeRequestForm.startDate.trim();
    const endDate = employeeRequestForm.endDate.trim();
    if ((startDate && !isIsoDate(startDate)) || (endDate && !isIsoDate(endDate))) {
      Alert.alert("Tarih hatalı", "Talep tarihlerini 2026-05-12 formatında girin.");
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      Alert.alert("Tarih hatalı", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
      return;
    }
    const amount = safePositive(tryParseNumber(employeeRequestForm.amount));
    const hours = safePositive(tryParseNumber(employeeRequestForm.hours));
    if ((employeeRequestForm.type === "ADVANCE" || employeeRequestForm.type === "EXPENSE") && amount <= 0) {
      Alert.alert("Tutar eksik", "Avans veya masraf talebi için tutar girin.");
      return;
    }
    if (employeeRequestForm.type === "OVERTIME" && hours <= 0) {
      Alert.alert("Saat eksik", "Mesai talebi için saat girin.");
      return;
    }
    const now = new Date().toISOString();
    const notification: EmployeeNotification = {
      id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Talep oluşturuldu",
      message: `${title} talebi onay akışına alındı.`,
      tone: "SUCCESS",
      read: false,
      createdAt: now
    };
    setAppData((prev) => ({
      ...prev,
      employeePortal: {
        ...prev.employeePortal,
        requests: [
          {
            id: `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: employeeRequestForm.type,
            status: "PENDING",
            title,
            startDate,
            endDate,
            amount,
            hours,
            note: employeeRequestForm.note.trim(),
            managerNote: "",
            createdAt: now,
            updatedAt: now
          },
          ...prev.employeePortal.requests
        ],
        notifications: [notification, ...prev.employeePortal.notifications].slice(0, 50)
      }
    }));
    setEmployeeRequestForm({ type: "LEAVE", title: "", startDate: "", endDate: "", amount: "", hours: "", note: "" });
  };

  const updateEmployeeRequestStatus = (id: string, status: EmployeeRequestStatus) => {
    const target = appData.employeePortal.requests.find((item) => item.id === id);
    const now = new Date().toISOString();
    const notification: EmployeeNotification | null = target
      ? {
          id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: "Talep durumu güncellendi",
          message: `${target.title} için durum: ${EMPLOYEE_REQUEST_STATUS_LABELS[status]}.`,
          tone: status === "APPROVED" ? "SUCCESS" : status === "REJECTED" ? "DANGER" : "INFO",
          read: false,
          createdAt: now
        }
      : null;
    setAppData((prev) => ({
      ...prev,
      employeePortal: {
        ...prev.employeePortal,
        requests: prev.employeePortal.requests.map((item) =>
          item.id === id ? { ...item, status, updatedAt: now } : item
        ),
        notifications: notification
          ? [notification, ...prev.employeePortal.notifications].slice(0, 50)
          : prev.employeePortal.notifications
      }
    }));
  };

  const setEmployeePortalField = (field: keyof Omit<AppData["employeePortal"], "requests" | "documents" | "notifications">, value: string) => {
    setAppData((prev) => ({
      ...prev,
      employeePortal: {
        ...prev.employeePortal,
        [field]: field === "leaveBalanceDays" ? safePositive(tryParseNumber(value)) : value
      }
    }));
  };

  const addEmployeeDocument = () => {
    if (!employeeDocumentForm.title.trim()) {
      Alert.alert("Belge adı eksik", "Belge için başlık girin.");
      return;
    }
    const now = new Date().toISOString();
    const notification: EmployeeNotification = {
      id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Belge yüklendi",
      message: `${employeeDocumentForm.title.trim()} personel dosyasına eklendi.`,
      tone: "SUCCESS",
      read: false,
      createdAt: now
    };
    setAppData((prev) => ({
      ...prev,
      employeePortal: {
        ...prev.employeePortal,
        documents: [
          ...prev.employeePortal.documents,
          {
            id: `employee-document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: employeeDocumentForm.title.trim(),
            type: employeeDocumentForm.type,
            uri: employeeDocumentForm.uri.trim(),
            note: employeeDocumentForm.note.trim(),
            createdAt: now
          }
        ],
        notifications: [notification, ...prev.employeePortal.notifications].slice(0, 50)
      }
    }));
    setEmployeeDocumentForm({ title: "", type: "IDENTITY", uri: "", note: "" });
  };

  const pickEmployeeDocumentImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("İzin gerekli", "Belge fotoğrafı seçmek için galeri izni vermelisiniz.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      const sourceUri = result.assets[0].uri;
      const extension = sourceUri.split(".").pop()?.split("?")[0] || "jpg";
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
      if (!baseDir) {
        setEmployeeDocumentForm((prev) => ({ ...prev, uri: sourceUri }));
        return;
      }
      const targetDir = `${baseDir}employee-documents/`;
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true }).catch(() => {});
      const targetUri = `${targetDir}document-${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: sourceUri, to: targetUri }).catch(() => {});
      setEmployeeDocumentForm((prev) => ({
        ...prev,
        title: prev.title.trim() || "Personel belgesi",
        uri: targetUri
      }));
    } catch {
      Alert.alert("Belge", "Belge seçilemedi. Lütfen tekrar deneyin.");
    }
  };

  const deleteEmployeeDocument = (id: string) => {
    const target = appData.employeePortal.documents.find((item) => item.id === id);
    setAppData((prev) => ({
      ...prev,
      employeePortal: {
        ...prev.employeePortal,
        documents: prev.employeePortal.documents.filter((item) => item.id !== id)
      }
    }));
    if (target?.uri && target.uri.startsWith(FileSystem.documentDirectory ?? "")) {
      void FileSystem.deleteAsync(target.uri, { idempotent: true }).catch(() => {});
    }
  };

  const markEmployeeNotificationsRead = () => {
    setAppData((prev) => ({
      ...prev,
      employeePortal: {
        ...prev.employeePortal,
        notifications: prev.employeePortal.notifications.map((item) => ({ ...item, read: true }))
      }
    }));
  };

  const downloadEmployeePortalPdf = async () => {
    const requests = employeeRequests
      .map((item) => `${item.createdAt.slice(0, 10)} | ${item.title} | ${EMPLOYEE_REQUEST_STATUS_LABELS[item.status]} | ${item.note || "-"}`)
      .join("\n");
    const documents = appData.employeePortal.documents.map((item) => `${item.title} | ${item.type} | ${item.uri || "-"}`).join("\n");
    const lines = [
      `Çalışan: ${appData.profile.fullName || authUser?.username || "-"}`,
      `Departman: ${appData.employeePortal.department || "-"}`,
      `Pozisyon: ${appData.employeePortal.position || "-"}`,
      `Telefon: ${appData.profile.phone || "-"}`,
      `E-posta: ${appData.profile.email || "-"}`,
      `IBAN: ${appData.employeePortal.iban || "-"}`,
      `İzin bakiyesi: ${appData.employeePortal.leaveBalanceDays} gün`,
      "",
      "Bu Ay Bordro/Puantaj",
      `Hak edilen toplam: ${formatCurrency(summary.expectedTotal)}`,
      `Yatırılan toplam: ${formatCurrency(summary.paidTotal)}`,
      `Fark: ${formatSignedCurrency(summary.difference)}`,
      `Çalışılan gün: ${summary.workedDays}`,
      `Yıllık izin: ${summary.annualLeaveDays}`,
      `Rapor: ${summary.reportDays}`,
      `Fazla mesai: ${summary.overtimeHours} saat`,
      "",
      "Talep Geçmişi",
      requests || "Talep kaydı yok.",
      "",
      "Belge Arşivi",
      documents || "Belge kaydı yok."
    ];
    const html = [
      "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:22px;color:#0f172a;\">",
      "<h1>Personel Portalı Özeti</h1>",
      "<pre style=\"white-space:pre-wrap;font-family:monospace;\">" + safeText(lines.join("\n")) + "</pre>",
      "</body></html>"
    ].join("");
    await sharePdf(html, "Personel Portalı PDF", `personel-portali-${monthKey}.pdf`);
  };

  const pickEvidenceImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("İzin gerekli", "Belge fotoğrafı seçmek için galeri izni vermelisiniz.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      const sourceUri = result.assets[0].uri;
      const extension = sourceUri.split(".").pop()?.split("?")[0] || "jpg";
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
      if (!baseDir) {
        setEvidenceForm((prev) => ({ ...prev, uri: sourceUri }));
        return;
      }
      const targetDir = `${baseDir}evidence/`;
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true }).catch(() => {});
      const targetUri = `${targetDir}evidence-${monthKey}-${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: sourceUri, to: targetUri }).catch(() => {});
      setEvidenceForm((prev) => ({
        ...prev,
        title: prev.title.trim() || "Belge fotoğrafı",
        uri: targetUri
      }));
    } catch {
      Alert.alert("Belge", "Belge fotoğrafı seçilemedi. Lütfen tekrar deneyin.");
    }
  };

  const deleteEvidenceFile = (id: string) => {
    const target = appData.evidenceFiles.find((item) => item.id === id);
    setAppData((prev) => ({
      ...prev,
      evidenceFiles: prev.evidenceFiles.filter((item) => item.id !== id)
    }));
    if (target?.uri && target.uri.startsWith(FileSystem.documentDirectory ?? "")) {
      void FileSystem.deleteAsync(target.uri, { idempotent: true }).catch(() => {});
    }
  };

  const openEvidenceFile = async (uri: string) => {
    if (!uri.trim()) {
      return;
    }
    try {
      const canOpen = await Linking.canOpenURL(uri);
      if (canOpen) {
        await Linking.openURL(uri);
        return;
      }
      Alert.alert("Belge yolu", uri);
    } catch {
      Alert.alert("Belge yolu", uri);
    }
  };

  const applyDayStatusToDates = (dateKeys: string[], status: DayStatus | null) => {
    if (dateKeys.length === 0) {
      return;
    }
    if (isMonthClosed) {
      Alert.alert("Ay kapalı", "Bu ay kapalı olduğu için değişiklik yapılamaz.");
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
          nextRecords[dateKey] = createWorkedRecord(dateKey, effectiveSettings, true);
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
      Alert.alert("Saat hatalı", "Başlangıç ve bitiş 20:00 formatında olmalı.");
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
      Alert.alert("Toplu işlem", "Önce takvimden bir aralık seçin.");
      return;
    }
    const nextStatusText = dayStatusLabel(status);
    Alert.alert(
      "Toplu işlem onayı",
      `${bulkRangeDateKeys.length} güne '${nextStatusText}' durumu uygulanacak. Devam edilsin mi?`,
      [
        { text: "Vazgeç", style: "cancel" },
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
      Alert.alert("Tarih hatalı", "Tarih YYYY-MM-DD formatında olmalıdır.");
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
    const value = safePositive(tryParseNumber(raw));
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        [key]: value
      },
      salaryHistory: prev.salaryHistory.map((entry) => {
        const isActiveForMonth = entry.startMonth <= monthKey && (!entry.endMonth || entry.endMonth >= monthKey);
        if (!isActiveForMonth) {
          return entry;
        }
        if (
          key === "monthlySalary" ||
          key === "monthlyBaseHours" ||
          key === "weeklyOvertimeThresholdHours" ||
          key === "dailyOvertimeThresholdHours" ||
          key === "monthlyMealAllowance" ||
          key === "monthlyTransportAllowance"
        ) {
          return { ...entry, [key]: value };
        }
        return entry;
      })
    }));
  };

  const setCoefficient = (key: "overtime" | "sunday" | "holiday" | "ubgt", raw: string) => {
    const value = safePositive(tryParseNumber(raw));
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        coefficients: {
          ...prev.settings.coefficients,
          [key]: value
        }
      },
      salaryHistory: prev.salaryHistory.map((entry) => {
        const isActiveForMonth = entry.startMonth <= monthKey && (!entry.endMonth || entry.endMonth >= monthKey);
        if (!isActiveForMonth) {
          return entry;
        }
        return {
          ...entry,
          coefficients: {
            ...entry.coefficients,
            [key]: value
          }
        };
      })
    }));
  };

  const upsertCurrentMonthSalaryHistory = (
    patch: Partial<Omit<SalaryHistoryEntry, "id" | "startMonth" | "endMonth">>
  ) => {
    setAppData((prev) => {
      const existing = [...prev.salaryHistory]
        .filter((entry) => entry.startMonth <= monthKey && (!entry.endMonth || entry.endMonth >= monthKey))
        .sort((a, b) => b.startMonth.localeCompare(a.startMonth))[0];
      const base: SalaryHistoryEntry =
        existing ?? {
          id: `salary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          startMonth: monthKey,
          endMonth: "",
          monthlySalary: effectiveSettings.monthlySalary,
          monthlyBaseHours: effectiveSettings.monthlyBaseHours,
          weeklyOvertimeThresholdHours: effectiveSettings.weeklyOvertimeThresholdHours,
          dailyOvertimeThresholdHours: effectiveSettings.dailyOvertimeThresholdHours,
          monthlyMealAllowance: effectiveSettings.monthlyMealAllowance,
          monthlyTransportAllowance: effectiveSettings.monthlyTransportAllowance,
          coefficients: { ...effectiveSettings.coefficients },
          note: "Özet ekranından oluşturuldu"
        };
      const nextEntry = normalizeSalaryHistory(
        [
          {
            ...base,
            ...patch,
            coefficients: {
              ...base.coefficients,
              ...patch.coefficients
            }
          }
        ],
        prev.settings
      )[0];
      return {
        ...prev,
        salaryHistory: [
          ...prev.salaryHistory.filter((entry) => entry.id !== nextEntry.id),
          nextEntry
        ].sort((a, b) => a.startMonth.localeCompare(b.startMonth))
      };
    });
  };

  const setCurrentMonthSalaryNumber = (
    key:
      | "monthlySalary"
      | "monthlyBaseHours"
      | "weeklyOvertimeThresholdHours"
      | "dailyOvertimeThresholdHours"
      | "monthlyMealAllowance"
      | "monthlyTransportAllowance",
    raw: string
  ) => {
    upsertCurrentMonthSalaryHistory({ [key]: safePositive(tryParseNumber(raw)) });
  };

  const setCurrentMonthSalaryCoefficient = (key: "overtime" | "sunday" | "ubgt", raw: string) => {
    upsertCurrentMonthSalaryHistory({
      coefficients: {
        ...effectiveSettings.coefficients,
        [key]: safePositive(tryParseNumber(raw))
      }
    });
  };

  const resetSalaryHistoryForm = () => {
    setSalaryHistoryEditingId(null);
    setSalaryHistoryForm({
      startMonth: monthKey,
      endMonth: "",
      monthlySalary: String(effectiveSettings.monthlySalary),
      monthlyBaseHours: String(effectiveSettings.monthlyBaseHours),
      weeklyOvertimeThresholdHours: String(effectiveSettings.weeklyOvertimeThresholdHours),
      dailyOvertimeThresholdHours: String(effectiveSettings.dailyOvertimeThresholdHours),
      monthlyMealAllowance: String(effectiveSettings.monthlyMealAllowance),
      monthlyTransportAllowance: String(effectiveSettings.monthlyTransportAllowance),
      overtimeCoefficient: String(effectiveSettings.coefficients.overtime),
      sundayCoefficient: String(effectiveSettings.coefficients.sunday),
      ubgtCoefficient: String(effectiveSettings.coefficients.ubgt),
      note: ""
    });
  };

  const editSalaryHistoryEntry = (entry: SalaryHistoryEntry) => {
    setSalaryHistoryEditingId(entry.id);
    setSalaryHistoryForm({
      startMonth: entry.startMonth,
      endMonth: entry.endMonth,
      monthlySalary: String(entry.monthlySalary),
      monthlyBaseHours: String(entry.monthlyBaseHours),
      weeklyOvertimeThresholdHours: String(entry.weeklyOvertimeThresholdHours),
      dailyOvertimeThresholdHours: String(entry.dailyOvertimeThresholdHours),
      monthlyMealAllowance: String(entry.monthlyMealAllowance),
      monthlyTransportAllowance: String(entry.monthlyTransportAllowance),
      overtimeCoefficient: String(entry.coefficients.overtime),
      sundayCoefficient: String(entry.coefficients.sunday),
      ubgtCoefficient: String(entry.coefficients.ubgt),
      note: entry.note
    });
  };

  const saveSalaryHistoryEntry = () => {
    if (!isMonthKey(salaryHistoryForm.startMonth) || (salaryHistoryForm.endMonth && !isMonthKey(salaryHistoryForm.endMonth))) {
      Alert.alert("Dönem hatalı", "Başlangıç ve bitiş dönemi YYYY-MM formatında olmalıdır.");
      return;
    }
    if (salaryHistoryForm.endMonth && salaryHistoryForm.endMonth < salaryHistoryForm.startMonth) {
      Alert.alert("Dönem hatalı", "Bitiş dönemi başlangıçtan önce olamaz.");
      return;
    }

    const entry = normalizeSalaryHistory(
      [
        {
          id: salaryHistoryEditingId ?? `salary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          startMonth: salaryHistoryForm.startMonth,
          endMonth: salaryHistoryForm.endMonth,
          monthlySalary: safePositive(tryParseNumber(salaryHistoryForm.monthlySalary)),
          monthlyBaseHours: safePositive(tryParseNumber(salaryHistoryForm.monthlyBaseHours)) || 225,
          weeklyOvertimeThresholdHours: safePositive(tryParseNumber(salaryHistoryForm.weeklyOvertimeThresholdHours)) || 45,
          dailyOvertimeThresholdHours: safePositive(tryParseNumber(salaryHistoryForm.dailyOvertimeThresholdHours)) || 7.5,
          monthlyMealAllowance: safePositive(tryParseNumber(salaryHistoryForm.monthlyMealAllowance)),
          monthlyTransportAllowance: safePositive(tryParseNumber(salaryHistoryForm.monthlyTransportAllowance)),
          coefficients: {
            overtime: safePositive(tryParseNumber(salaryHistoryForm.overtimeCoefficient)) || 1.5,
            sunday: safePositive(tryParseNumber(salaryHistoryForm.sundayCoefficient)) || 1.5,
            holiday: effectiveSettings.coefficients.holiday,
            ubgt: safePositive(tryParseNumber(salaryHistoryForm.ubgtCoefficient)) || 1
          },
          note: salaryHistoryForm.note
        }
      ],
      appData.settings
    )[0];

    setAppData((prev) => ({
      ...prev,
      salaryHistory: [
        ...prev.salaryHistory.filter((item) => item.id !== entry.id),
        entry
      ].sort((a, b) => a.startMonth.localeCompare(b.startMonth))
    }));
    resetSalaryHistoryForm();
  };

  const deleteSalaryHistoryEntry = (id: string) => {
    setAppData((prev) => ({
      ...prev,
      salaryHistory: prev.salaryHistory.filter((entry) => entry.id !== id)
    }));
    if (salaryHistoryEditingId === id) {
      resetSalaryHistoryForm();
    }
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
        Alert.alert("İzin gerekli", "Galeriden profil fotoğrafı seçmek için fotoğraf izni vermelisiniz.");
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
      Alert.alert("Fotoğraf", "Fotoğraf seçilemedi. Lütfen tekrar deneyin.");
    }
  };

  const closeMonth = () => {
    if (!isMonthKey(monthKey)) {
      Alert.alert("Ay formatı hatalı", "Ay bilgisi YYYY-MM olmalı.");
      return;
    }

    Alert.alert(
      "Ay kapatma onayı",
      "Bu ay kapatılacak, kayıtlar değiştirilemeyecek. Emin misin?",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Ayı Kapat",
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
    Alert.alert("Tüm sistemi sıfırla", "Tüm kayıtlar silinecek. Devam edilsin mi?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sıfırla",
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
    Alert.alert("Yerel verileri sıfırla", "Bu cihazdaki kayıtlar temizlenecek. Devam edilsin mi?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sıfırla",
        style: "destructive",
        onPress: async () => {
          setAppData(DEFAULT_DATA);
          setMonthKey(currentMonthKey());
          setActiveTab("CALENDAR");
        }
      }
    ]);
  };

  const loadUserWorkspace = async (user: AuthUser, source: "REMOTE") => {
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
        `Kullanıcı: ${authUser?.username ?? "-"}`,
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
        Alert.alert("Destek", "Bu cihazda e-posta uygulaması açılamadı.");
        return;
      }
      await Linking.openURL(mailUrl);
    } catch {
      Alert.alert("Destek", "İletişim ekranı açılamadı.");
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

  const resetAuthSecurityForm = () => {
    setAuthSecurityQuestion("");
    setAuthSecurityAnswer("");
    setAuthResetNewPassword("");
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

  const handleLogin = async () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("Kullanıcı adı ve şifre zorunludur.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    try {
      const user = await remoteLogin(authUsername, authPassword);
      await loadUserWorkspace(user, "REMOTE");
      await reportClientSecurity();
      setAuthPassword("");
      setAuthInviteKey("");
      if (user.role === "ADMIN") {
        await refreshAdminUsers();
        await refreshAdminStats();
      }
    } catch (error) {
      setAuthError(sanitizeUserMessage(error, "Giriş yapılamadı."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegister = async () => {
    if (!authUsername.trim() || !authPassword.trim() || !authInviteKey.trim()) {
      setAuthError("Kullanıcı adı, şifre ve kayıt anahtarı zorunludur.");
      return;
    }
    if (!authSecurityQuestion.trim() || !authSecurityAnswer.trim()) {
      setAuthError("Güvenlik sorusu ve cevabı zorunludur.");
      return;
    }

    if (!allRequiredConsentsAccepted) {
      setAuthError("Zorunlu onaylar tamamlanmadan kayıt yapılamaz.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    try {
      const payload = {
        username: authUsername,
        password: authPassword,
        inviteKey: authInviteKey,
        securityQuestion: authSecurityQuestion,
        securityAnswer: authSecurityAnswer,
        consents: buildConsentPayload()
      };

      const user = await remoteRegister(payload);
      await loadUserWorkspace(user, "REMOTE");
      await reportClientSecurity();
      setAuthInviteKey("");
      setAuthPassword("");
      resetAuthSecurityForm();
      resetConsentForm();
    } catch (error) {
      setAuthError(sanitizeUserMessage(error, "Kayıt işlemi tamamlanamadı."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await remoteLogout().catch(() => {});
    setAuthUser(null);
    setAuthSource(null);
    setAuthPassword("");
    setAuthInviteKey("");
    resetAuthSecurityForm();
    resetConsentForm();
    setAppData(DEFAULT_DATA);
    setAdminUsers([]);
    setAdminStats(null);
    setAdminSelectedUser(null);
    setAdminIpBans([]);
    setAdminIpInput("");
    setAdminIpReason("Güvenlik ihlali");
    setAdminBanDurationHours("");
    setDrawerVisible(false);
  };

  const handleLoadSecurityQuestion = async () => {
    if (!authUsername.trim()) {
      setAuthError("Önce kullanıcı adını girin.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const question = await remoteGetSecurityQuestion(authUsername);
      setAuthSecurityQuestion(question);
    } catch (error) {
      setAuthError(sanitizeUserMessage(error, "Güvenlik sorusu alınamadı."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!authUsername.trim() || !authSecurityAnswer.trim() || !authResetNewPassword.trim()) {
      setAuthError("Kullanıcı adı, güvenlik cevabı ve yeni şifre zorunludur.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await remoteResetPasswordWithSecurityAnswer({
        username: authUsername,
        securityAnswer: authSecurityAnswer,
        newPassword: authResetNewPassword
      });
      setAuthMode("USER_LOGIN");
      setAuthPassword("");
      resetAuthSecurityForm();
      setAuthError("Şifre başarıyla yenilendi. Yeni şifrenizle giriş yapabilirsiniz.");
    } catch (error) {
      setAuthError(sanitizeUserMessage(error, "Şifre sıfırlanamadı."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDeleteOwnAccount = () => {
    if (!authUser || authUser.role !== "USER") {
      return;
    }
    if (!deleteAccountPassword.trim() || !deleteAccountSecurityAnswer.trim()) {
      Alert.alert("Eksik Bilgi", "Şifre ve güvenlik cevabı zorunludur.");
      return;
    }
    Alert.alert("Hesabı Sil", "Bu işlem geri alınamaz. Devam etmek istiyor musunuz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Evet, Sil",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await remoteDeleteOwnAccount({
                password: deleteAccountPassword,
                securityAnswer: deleteAccountSecurityAnswer
              });
              setDeleteAccountPassword("");
              setDeleteAccountSecurityAnswer("");
              await handleLogout();
            } catch (error) {
              Alert.alert("Hata", sanitizeUserMessage(error, "Hesap silinemedi."));
            }
          })();
        }
      }
    ]);
  };

  const refreshAdminUsers = async () => {
    try {
      const users = await adminGetUsers(adminSearch);
      setAdminUsers(users);
      setAdminError("");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Kullanıcı listesi alınamadı.");
    }
  };

  const refreshAdminStats = async () => {
    try {
      const stats = await adminGetStats();
      setAdminStats(stats);
      setAdminError("");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Admin istatistikleri alınamadı.");
    }
  };

  const refreshAdminIpBans = async () => {
    try {
      const items = await adminGetIpBans();
      setAdminIpBans(items);
      setAdminError("");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "IP ban listesi alınamadı.");
    }
  };

  const openAdminUserDetail = async (userId: string) => {
    try {
      const detail = await adminGetUserDetail(userId);
      setAdminSelectedUser(detail);
      setAdminError("");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Kullanıcı detayı alınamadı.");
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
      Alert.alert("Hata", error instanceof Error ? error.message : "Admin işlemi başarısız.");
    } finally {
      setAdminBusy(false);
    }
  };

  const confirmPurgeUsers = () => {
    Alert.alert(
      "Tüm kullanıcılar temizlensin mi?",
      "Bu işlem admin hesaplarını korur; normal kullanıcıları, oturumlarını ve puantaj verilerini kalıcı olarak siler.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Kullanıcıları Temizle",
          style: "destructive",
          onPress: () =>
            void runAdminAction(async () => {
              const result = await adminPurgeUsers();
              setAdminSelectedUser(null);
              Alert.alert(
                "Temizleme tamamlandı",
                `${result.deletedUsers} kullanıcı silindi. ${result.protectedAdmins} admin hesabı korundu.`
              );
            })
        }
      ]
    );
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
        setAdminError(error instanceof Error ? error.message : "Admin panel verisi alınamadı.");
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
        Alert.alert("PDF hazır", targetUri || uri);
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
          ? `${record.work?.start ?? effectiveSettings.defaultShiftStart}-${record.work?.end ?? effectiveSettings.defaultShiftEnd}`
          : "-";
      const totalHours =
        record.status === "WORKED" ? `${round2(record.work?.totalHours ?? effectiveSettings.defaultShiftHours)}` : "0";
      const workHours = record.work?.totalHours ?? effectiveSettings.defaultShiftHours;
      const overtimeHours =
        record.status === "WORKED"
          ? `${calculateDailyOvertimeHours(workHours, effectiveSettings, record.work?.manualOvertimeOverrideHours)}`
          : "0";
      const benefitEligible = isMealTransportEligible(dateKey, dayType, record.status, appData.halfHolidayDates) ? "Evet" : "Hayır";
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
      Alert.alert("Ay formatı hatalı", "Ay bilgisi YYYY-MM olmalı.");
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
        `Kullanıcı: ${authUser?.username ?? "-"}`,
        `Hesap dönemi: ${periodText}`,
        "",
        `Maaş dönem günü: ${summary.salaryPeriodDays}`,
        `Ödenebilir gün: ${summary.payableDays}`,
        `Fiili çalışılan gün: ${summary.workedDays}`,
        `Eksik/ödenmeyen gün: ${summary.nonPayableDays}`,
        `Maaş hak ediş oranı: %${summary.salaryRatioPercent}`,
        `Toplam çalışma saati: ${summary.totalHours}`,
        `Toplam mesai saati: ${summary.overtimeHours}`,
        `Hak edilen maaş: ${formatCurrency(summary.baseSalary)}`,
        `Rapor kesinti: ${formatCurrency(summary.reportDeduction)}`,
        `Mesai ücreti: ${formatCurrency(summary.overtimePay)}`,
        `Pazar ücreti: ${formatCurrency(summary.sundayPay)}`,
        `UBGT ücreti: ${formatCurrency(summary.ubgtPay)}`,
        `Yemek toplam: ${formatCurrency(summary.mealTotal)}`,
        `Yol toplam: ${formatCurrency(summary.transportTotal)}`,
        `Hak edilen toplam: ${formatCurrency(summary.expectedTotal)}`,
        `Yatırılan toplam: ${formatCurrency(summary.paidTotal)}`,
        `Fark: ${formatSignedCurrency(summary.difference)}`,
        "",
        "Tarih;Gün Tipi;Durum;Saat;Toplam Saat;Günlük Mesai;Yemek/Yol;Not"
      ];

      const content = [...header, ...csvRows].join("\n");
      const html = [
        "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:18px;color:#0f172a;\">",
        "<h1>Puantaj Özeti</h1>",
        "<pre style=\"white-space:pre-wrap;font-family:monospace;\">" + safeText(content) + "</pre>",
        "</body></html>"
      ].join("");
      await sharePdf(html, "Puantaj Özeti PDF", `puantaj-ozeti-${monthKey}.pdf`);
    } catch {
      Alert.alert("Hata", GENEL_HATA);
    }
  };

  const downloadSalarySummaryPdf = async () => {
    const lines = [
      `Ay: ${monthLabelTr(monthKey)} (${monthKey})`,
      `Hesap dönemi: ${periodText}`,
      "",
      `Maaş dönem günü: ${summary.salaryPeriodDays}`,
      `Ödenebilir gün: ${summary.payableDays}`,
      `Fiili çalışılan gün: ${summary.workedDays}`,
      `Eksik/ödenmeyen gün: ${summary.nonPayableDays}`,
      `Maaş hak ediş oranı: %${summary.salaryRatioPercent}`,
      `Maaş hak edişi: ${formatCurrency(summary.baseSalary)}`,
      `Mesai hak edişi: ${formatCurrency(summary.overtimePay)}`,
      `Pazar hak edişi: ${formatCurrency(summary.sundayPay)}`,
      `UBGT hak edişi: ${formatCurrency(summary.ubgtPay)}`,
      `Yemek hak edişi: ${formatCurrency(summary.mealTotal)}`,
      `Yol hak edişi: ${formatCurrency(summary.transportTotal)}`,
      `Toplam hak ediş: ${formatCurrency(summary.expectedTotal)}`,
      `Yatırılan toplam: ${formatCurrency(summary.paidTotal)}`,
      `Eksik/Fazla fark: ${formatSignedCurrency(summary.difference)}`
    ];
    const html = [
      "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:22px;color:#0f172a;\">",
      "<h1>Maaş Özeti</h1>",
      "<pre style=\"white-space:pre-wrap;font-family:monospace;\">" + safeText(lines.join("\n")) + "</pre>",
      "</body></html>"
    ].join("");
    await sharePdf(html, "Maaş Özeti PDF", `maas-ozeti-${monthKey}.pdf`);
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
      "<h1>Gün Gün Detay</h1>",
      "<pre style=\"white-space:pre-wrap;font-family:monospace;\">" + safeText(table || "Kayıt bulunamadı.") + "</pre>",
      "</body></html>"
    ].join("");
    await sharePdf(html, "Gün Gün Detay PDF", `gun-gun-detay-${monthKey}.pdf`);
  };

  const downloadWorkerClaimFilePdf = async () => {
    const dayRows = buildDayRowsForMonth();
    const rowHtml = (label: string, value: string) =>
      `<tr><th>${safeText(label)}</th><td>${safeText(value)}</td></tr>`;
    const paymentRows = currentMonthTransactions
      .map(
        (item) =>
          `<tr><td>${safeText(item.date)}</td><td>${safeText(item.kind)}</td><td>${safeText(formatCurrency(item.amount))}</td><td>${safeText(item.description || "-")}</td></tr>`
      )
      .join("");
    const evidenceRows = currentMonthEvidence
      .map(
        (item) =>
          `<tr><td>${safeText(item.title)}</td><td>${safeText(item.type)}</td><td>${safeText(item.uri || "-")}</td><td>${safeText(item.note || "-")}</td></tr>`
      )
      .join("");
    const dayTableRows = dayRows
      .map(
        (row) =>
          `<tr><td>${safeText(row.dateLabel)}</td><td>${safeText(row.dayType)}</td><td>${safeText(row.status)}</td><td>${safeText(row.workText)}</td><td>${safeText(row.totalHours)}</td><td>${safeText(row.overtimeHours)}</td><td>${safeText(row.benefitEligible)}</td><td>${safeText(row.note || "-")}</td></tr>`
      )
      .join("");
    const statementDifference = summary.statementTotal > 0 ? summary.statementTotal - summary.expectedTotal : 0;
    const html = [
      "<html lang=\"tr\"><head><meta charset=\"utf-8\" />",
      "<style>",
      "body{font-family:Arial,sans-serif;color:#0f172a;padding:22px;line-height:1.45}",
      "h1{font-size:24px;margin:0 0 4px} h2{font-size:17px;margin:22px 0 8px;color:#0f766e}",
      "p{margin:4px 0} table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}",
      "th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top} th{background:#f1f5f9}",
      ".note{font-size:11px;color:#475569;margin-top:18px}.total{font-weight:700;color:#b91c1c}",
      "</style></head><body>",
      "<h1>Puantaj Maaş İşçi Alacağı Dosyası</h1>",
      `<p><strong>Ay:</strong> ${safeText(monthLabelTr(monthKey))} (${safeText(monthKey)})</p>`,
      `<p><strong>Kullanıcı:</strong> ${safeText(authUser?.username ?? "-")}</p>`,
      `<p><strong>Hesap dönemi:</strong> ${safeText(periodText)}</p>`,
      "<h2>Hak Ediş Özeti</h2>",
      "<table>",
      rowHtml("Net maaş / dönem hak edişi", formatCurrency(summary.baseSalary)),
      rowHtml("Normal çalışma saati", `${summary.totalHours - summary.overtimeHours} saat`),
      rowHtml("Toplam fiili saat", `${summary.totalHours} saat`),
      rowHtml("Fazla mesai saati", `${summary.overtimeHours} saat`),
      rowHtml("Pazar çalışma saati/günü", `${summary.sundayWorkedDays} gün`),
      rowHtml("UBGT günü", `${summary.ubgtWorkedDays} gün`),
      rowHtml("Gece çalışma saati", `${summary.nightHours} saat`),
      rowHtml("Fazla mesai ücreti", formatCurrency(summary.overtimePay)),
      rowHtml("Pazar ücreti", formatCurrency(summary.sundayPay)),
      rowHtml("UBGT ücreti", formatCurrency(summary.ubgtPay)),
      rowHtml("Gece primi", formatCurrency(summary.nightPremiumPay)),
      rowHtml("Yemek + yol", formatCurrency(summary.sideBenefitsTotal)),
      rowHtml("Toplam hak ediş", formatCurrency(summary.expectedTotal)),
      rowHtml("Yatırılan toplam", formatCurrency(summary.paidTotal)),
      rowHtml("Eksik / fazla fark", formatSignedCurrency(summary.difference)),
      "</table>",
      "<h2>Bordro Karşılaştırması</h2>",
      "<table>",
      rowHtml("Bordro toplamı", formatCurrency(summary.statementTotal)),
      rowHtml("Gerçek hak ediş", formatCurrency(summary.expectedTotal)),
      rowHtml("Bordro farkı", summary.statementTotal > 0 ? formatSignedCurrency(statementDifference) : "Bordro girilmedi"),
      rowHtml("Bordro notu", currentMonthStatement?.note || "-"),
      "</table>",
      "<h2>Ödeme Hareketleri</h2>",
      "<table><tr><th>Tarih</th><th>Tip</th><th>Tutar</th><th>Açıklama</th></tr>",
      paymentRows || "<tr><td colspan=\"4\">Ödeme hareketi yok.</td></tr>",
      "</table>",
      "<h2>Gün Gün Puantaj</h2>",
      "<table><tr><th>Tarih</th><th>Gün tipi</th><th>Durum</th><th>Saat</th><th>Toplam</th><th>Mesai</th><th>Yemek/Yol</th><th>Not</th></tr>",
      dayTableRows || "<tr><td colspan=\"8\">Puantaj kaydı yok.</td></tr>",
      "</table>",
      "<h2>Delil / Belge Listesi</h2>",
      "<table><tr><th>Başlık</th><th>Tip</th><th>Dosya/Yol</th><th>Not</th></tr>",
      evidenceRows || "<tr><td colspan=\"4\">Belge kaydı yok.</td></tr>",
      "</table>",
      `<p class="note">${safeText("Bu rapor ön hesaplama amaçlıdır. Kesin sonuç için bordro, banka dekontu, SGK kaydı ve uzman/bilirkişi incelemesi gerekir.")}</p>`,
      "</body></html>"
    ].join("");
    await sharePdf(html, "İşçi Alacağı Dosyası PDF", `isci-alacagi-dosyasi-${monthKey}.pdf`);
  };

  const downloadLegalCalculationPdf = async () => {
    const dateTag = normalizedDateTag(appData.legal.hireDate, monthKey);
    const html = [
      "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:22px;color:#0f172a;line-height:1.6;\">",
      "<h1>Kıdem / İhbar Hesaplama Özeti</h1>",
      `<p><strong>İşe giriş:</strong> ${safeText(appData.legal.hireDate || "-")}</p>`,
      `<p><strong>İşten çıkış:</strong> ${safeText(appData.legal.terminationDate || "-")}</p>`,
      `<p><strong>Brüt ücret:</strong> ${safeText(formatCurrency(appData.legal.grossSalary))}</p>`,
      `<p><strong>Aylık yemek:</strong> ${safeText(formatCurrency(appData.legal.mealAllowance))}</p>`,
      `<p><strong>Aylık yol:</strong> ${safeText(formatCurrency(appData.legal.transportAllowance))}</p>`,
      `<p><strong>Diğer düzenli yan hak:</strong> ${safeText(formatCurrency(appData.legal.otherAllowance))}</p>`,
      `<p><strong>Damga vergisi oranı:</strong> %${safeText(String(appData.legal.stampTaxRate))}</p>`,
      `<p><strong>Kıdem tavanı:</strong> ${safeText(formatCurrency(appData.legal.severanceCap))}</p>`,
      `<hr />`,
      `<p><strong>Toplam çalışma süresi:</strong> ${safeText(legalResult.serviceText)}</p>`,
      `<p><strong>Kıdem tazminatı (tahmini):</strong> ${safeText(formatCurrency(legalResult.severancePayNet))}</p>`,
      `<p><strong>İhbar süresi:</strong> ${safeText(`${legalResult.noticeWeeks} hafta`)}</p>`,
      `<p><strong>İhbar tazminatı (tahmini):</strong> ${safeText(formatCurrency(legalResult.noticePay))}</p>`,
      `<p><strong>Kullanılmayan izin ücreti (tahmini):</strong> ${safeText(formatCurrency(legalResult.annualLeavePay))}</p>`,
      `<p><strong>Toplam tahmini alacak:</strong> ${safeText(formatCurrency(legalResult.estimatedTotal))}</p>`,
      `<p style="margin-top:18px;font-size:12px;">${safeText(HUKUK_UYARI_METNI)}</p>`,
      "</body></html>"
    ].join("");
    await sharePdf(html, "Kıdem / İhbar PDF", `kidem-ihbar-${dateTag}.pdf`);
  };

  const downloadResignationPdf = async () => {
    const dateTag = normalizedDateTag(appData.legal.resignationForm.letterDate, monthKey);
    const draft = effectiveDraft || generatedDraft;

    const html = [
      "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:20px;color:#0f172a;line-height:1.6;white-space:pre-wrap;\">",
      "<h1>İstifa / Fesih Dilekçesi</h1>",
      safeText(draft),
      "</body></html>"
    ].join("");

    await sharePdf(html, "İstifa Dilekçesi PDF", `istifa-dilekcesi-${dateTag}.pdf`);
  };

  if (!loaded) {
    return (
      <SafeAreaView style={[styles.centered, Platform.OS === "android" ? styles.androidTopInset : null]}>
        <ExpoStatusBar style={effectiveDarkMode ? "light" : "dark"} />
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.helper}>Veriler yükleniyor...</Text>
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
              <Image source={APP_LOGO} style={styles.authLogo} resizeMode="contain" />
              <Text style={styles.authBadge}>AYFSOFT</Text>
              <Text style={styles.authTitle}>Puantaj ve Maaş Takip</Text>
              <Text style={styles.authSubtitle}>
                Güvenli giriş yap, vardiyalarını yönet, hesaplamalarını anlık takip et.
              </Text>
              <View style={styles.authTrustRow}>
                <View style={styles.authTrustItem}>
                  <Text style={styles.authTrustValue}>45s</Text>
                  <Text style={styles.authTrustLabel}>Haftalık eşik</Text>
                </View>
                <View style={styles.authTrustItem}>
                  <Text style={styles.authTrustValue}>225s</Text>
                  <Text style={styles.authTrustLabel}>Aylık eşik</Text>
                </View>
                <View style={styles.authTrustItem}>
                  <Text style={styles.authTrustValue}>KVKK</Text>
                  <Text style={styles.authTrustLabel}>Güvenli kayıt</Text>
                </View>
              </View>
              <Pressable style={styles.legalChip} onPress={() => setLegalModalVisible(true)}>
                <Text style={styles.legalChipText}>KVKK, Gizlilik, Çerez, Cihaz Verisi ve Yasal Sorumluluklar</Text>
              </Pressable>
            </View>

            <View style={styles.authFormCard}>
              <LanguageSelector />

              <View style={styles.authModeRow}>
                <Pressable
                  style={[styles.authModeButton, authMode === "USER_LOGIN" ? styles.authModeButtonActive : null]}
                  onPress={() => setAuthMode("USER_LOGIN")}
                >
                  <Text
                    style={[styles.authModeButtonText, authMode === "USER_LOGIN" ? styles.authModeButtonTextActive : null]}
                  >
                    Kullanıcı Girişi
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.authModeButton, authMode === "USER_REGISTER" ? styles.authModeButtonActive : null]}
                  onPress={() => setAuthMode("USER_REGISTER")}
                >
                  <Text
                    style={[styles.authModeButtonText, authMode === "USER_REGISTER" ? styles.authModeButtonTextActive : null]}
                  >
                    Kayıt Ol
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.authModeButton, authMode === "FORGOT_PASSWORD" ? styles.authModeButtonActive : null]}
                  onPress={() => setAuthMode("FORGOT_PASSWORD")}
                >
                  <Text
                    style={[styles.authModeButtonText, authMode === "FORGOT_PASSWORD" ? styles.authModeButtonTextActive : null]}
                  >
                    Şifremi Unuttum
                  </Text>
                </Pressable>
              </View>

              {authMode === "USER_REGISTER" ? (
                <>
                  <Text style={styles.label}>Kayıt anahtarı</Text>
                  <TextInput
                    ref={inviteKeyInputRef}
                    value={authInviteKey}
                    onChangeText={(value) => {
                      setAuthInviteKey(value);
                      clearAuthError();
                    }}
                    secureTextEntry
                    style={styles.input}
                    placeholder="Kayıt anahtarını girin"
                    returnKeyType="next"
                    onSubmitEditing={() => usernameInputRef.current?.focus()}
                    blurOnSubmit={false}
                  />
                </>
              ) : null}

              <Text style={styles.label}>Kullanıcı adı</Text>
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
                placeholder="Kullanıcı adınızı girin"
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                blurOnSubmit={false}
              />

              <Text style={styles.label}>Şifre</Text>
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
                <>
                  <Text style={styles.label}>Güvenlik sorusu</Text>
                  <TextInput
                    value={authSecurityQuestion}
                    onChangeText={(value) => {
                      setAuthSecurityQuestion(value);
                      clearAuthError();
                    }}
                    style={styles.input}
                    placeholder="Örn: İlk okul öğretmeninizin adı?"
                  />
                  <Text style={styles.label}>Güvenlik cevabı</Text>
                  <TextInput
                    value={authSecurityAnswer}
                    onChangeText={(value) => {
                      setAuthSecurityAnswer(value);
                      clearAuthError();
                    }}
                    style={styles.input}
                    placeholder="Cevabınızı girin"
                  />
                </>
              ) : null}

              {authMode === "FORGOT_PASSWORD" ? (
                <>
                  <Pressable style={styles.secondaryButton} onPress={handleLoadSecurityQuestion} disabled={authBusy}>
                    <Text style={styles.secondaryButtonText}>Güvenlik Sorusunu Getir</Text>
                  </Pressable>
                  {authSecurityQuestion.trim() ? (
                    <View style={styles.summaryCard}>
                      <InfoRow label="Güvenlik sorusu" value={authSecurityQuestion} />
                    </View>
                  ) : null}
                  <Text style={styles.label}>Güvenlik cevabı</Text>
                  <TextInput
                    value={authSecurityAnswer}
                    onChangeText={(value) => {
                      setAuthSecurityAnswer(value);
                      clearAuthError();
                    }}
                    style={styles.input}
                    placeholder="Cevabınızı yazın"
                  />
                  <Text style={styles.label}>Yeni şifre</Text>
                  <TextInput
                    value={authResetNewPassword}
                    onChangeText={(value) => {
                      setAuthResetNewPassword(value);
                      clearAuthError();
                    }}
                    secureTextEntry
                    style={styles.input}
                    placeholder="Yeni şifre"
                  />
                </>
              ) : null}

              {authMode === "USER_REGISTER" ? (
                <View style={styles.summaryCard}>
                  <Text style={styles.label}>Zorunlu onaylar</Text>
                  <ConsentCheck
                    checked={consentKvkk}
                    onToggle={() => setConsentKvkk((prev) => !prev)}
                    text="KVKK Aydınlatma Metni'ni okudum ve kabul ediyorum."
                  />
                  <ConsentCheck
                    checked={consentAcikRiza}
                    onToggle={() => setConsentAcikRiza((prev) => !prev)}
                    text="Açık Rıza Metni'ni onaylıyorum."
                  />
                  <ConsentCheck
                    checked={consentGizlilik}
                    onToggle={() => setConsentGizlilik((prev) => !prev)}
                    text="Gizlilik Politikası'nı okudum ve kabul ediyorum."
                  />
                  <ConsentCheck
                    checked={consentCerez}
                    onToggle={() => setConsentCerez((prev) => !prev)}
                    text="Çerez Politikası'nı kabul ediyorum."
                  />
                  <ConsentCheck
                    checked={consentCihazVerisi}
                    onToggle={() => setConsentCihazVerisi((prev) => !prev)}
                    text="Cihaz Verisi Politikası'nı kabul ediyorum."
                  />
                  <ConsentCheck
                    checked={consentYasalSorumluluk}
                    onToggle={() => setConsentYasalSorumluluk((prev) => !prev)}
                    text="Yasal Sorumluluk Reddi ve Kullanım Şartları'nı kabul ediyorum."
                  />
                </View>
              ) : null}

              {authError ? <Text style={styles.error}>{authError}</Text> : null}

              {authMode === "USER_REGISTER" ? (
                <Pressable style={styles.primaryButton} onPress={handleRegister} disabled={authBusy}>
                  <Text style={styles.primaryButtonText}>{authBusy ? "Kayıt yapılıyor..." : "Kayıt Ol"}</Text>
                </Pressable>
              ) : authMode === "FORGOT_PASSWORD" ? (
                <Pressable style={styles.primaryButton} onPress={handleResetPassword} disabled={authBusy}>
                  <Text style={styles.primaryButtonText}>{authBusy ? "Sıfırlanıyor..." : "Şifreyi Yenile"}</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.primaryButton} onPress={handleLogin} disabled={authBusy}>
                  <Text style={styles.primaryButtonText}>{authBusy ? "Giriş yapılıyor..." : "Giriş Yap"}</Text>
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
            <Text style={styles.menuButtonText}>☰</Text>
          </Pressable>
          <Image source={APP_LOGO} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.title}>Puantaj Maaş Hesap</Text>
        </View>
        <Text style={styles.subtitle}>Takvim, dönem özeti ve hukuki bilgilendirme tek ekranda.</Text>
        <View style={styles.headerInfoRow}>
          <Text style={styles.helper}>{authUser.role === "ADMIN" ? "Yönetici" : "Kullanıcı"}: {authUser.username}</Text>
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
              <Text style={styles.todayButtonText}>Bugüne Git</Text>
            </Pressable>

            <View style={styles.calendarLegend}>
              <LegendItem color="#0b3f3a" text="Normal" />
              <LegendItem color="#312e81" text="Pazar" />
              <LegendItem color="#7f1d1d" text="UBGT" />
              <LegendItem color="#92400e" text="Raporlu" />
              <LegendItem color="#1e3a8a" text="İzinli" />
              <LegendItem color="#7c2d12" text="Yıllık" />
              <LegendItem color="#334155" text="Tatil" />
              <LegendItem color="#0f172a" text="Boş" />
            </View>

            {isMonthClosed ? <Text style={styles.closedBadge}>Bu ay kapalı, değişiklik yapılamaz.</Text> : null}

            <SummaryCard title="Ay Kontrolü">
              <InfoRow label="Dolu puantaj günü" value={`${summary.workedDays + summary.leaveDays + summary.annualLeaveDays + summary.reportDays + summary.holidayOffDays}`} />
              <InfoRow label="Eksik / boş gün" value={`${currentMonthMissingDays.length}`} valueColor={currentMonthMissingDays.length > 0 ? "#f59e0b" : "#22c55e"} strong />
              <InfoRow label="Belge kaydı" value={`${currentMonthEvidence.length}`} />
              <InfoRow label="Ödeme hareketi" value={`${currentMonthTransactions.length}`} />
              {currentMonthMissingDays.length > 0 ? (
                <Text style={styles.helper}>
                  İlk eksik günler: {currentMonthMissingDays.slice(0, 6).map(formatDateKeyTr).join(", ")}
                  {currentMonthMissingDays.length > 6 ? "..." : ""}
                </Text>
              ) : (
                <Text style={styles.helper}>Bu ayın tüm günleri işaretlenmiş görünüyor.</Text>
              )}
            </SummaryCard>

            <SummaryCard title="Toplu İşlem">
              <InfoRow label="Seçili gün sayısı" value={`${bulkRangeDateKeys.length}`} />
              <Pressable style={styles.secondaryButton} onPress={toggleBulkMode}>
                <Text style={styles.secondaryButtonText}>{bulkSelectMode ? "Toplu İşlemi Kapat" : "Toplu İşlemi Aç"}</Text>
              </Pressable>
              <Text style={styles.helper}>
                {bulkRangeDateKeys.length > 0
                  ? `Seçili aralık: ${formatDateKeyTr(bulkRangeDateKeys[0])} - ${formatDateKeyTr(
                      bulkRangeDateKeys[bulkRangeDateKeys.length - 1]
                    )} (${bulkRangeDateKeys.length} gün)`
                  : "Takvimde güne uzun basarak aralık seç."}
              </Text>
              {bulkSelectMode ? (
                <View style={styles.optionWrap}>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("WORKED")}>
                    <Text style={styles.optionButtonText}>Çalıştım</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("LEAVE")}>
                    <Text style={styles.optionButtonText}>İzinli</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("REPORT")}>
                    <Text style={styles.optionButtonText}>Raporlu</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("ANNUAL_LEAVE")}>
                    <Text style={styles.optionButtonText}>Yıllık İzin</Text>
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
                            ? shortShiftLabel(record?.work?.start ?? effectiveSettings.defaultShiftStart, record?.work?.end ?? effectiveSettings.defaultShiftEnd)
                            : ""}
                        </Text>

                        <Text numberOfLines={1} style={styles.dayTag}>
                          {isToday ? "Bugün" : dayType === "UBGT" ? "UBGT" : dayType === "SUNDAY" ? "Pazar" : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={styles.monthDiffBox}>
              <Text style={styles.infoLabel}>Bu ay farkı:</Text>
              <Text style={[styles.monthDiffValue, { color: differenceColor(summary.difference) }]}>
                {formatSignedCurrency(summary.difference)} ({monthlyDifferenceLabel(summary.difference)})
              </Text>
            </View>
          </View>
        ) : null}

        {activeTab === "SUMMARY" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dönem Özeti</Text>
            <Text style={styles.helper}>{monthLabelTr(monthKey)}</Text>
            {analytics.salaryWarning ? <Text style={styles.error}>{analytics.salaryWarning}</Text> : null}

            <View style={styles.optionWrap}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  void persistUserDataNow().catch((error) => {
                    Alert.alert("Hata", error instanceof Error ? error.message : "Kaydetme işlemi başarısız.");
                  });
                }}
              >
                <Text style={styles.primaryButtonText}>
                  {language === "th" ? "บันทึกการเปลี่ยนแปลง" : "Değişiklikleri Kaydet"}
                </Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={downloadSalarySummaryPdf}>
                <Text style={styles.secondaryButtonText}>Maaş Özeti PDF</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={downloadPuantajSummaryPdf}>
                <Text style={styles.secondaryButtonText}>Puantaj Özeti PDF</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={downloadDailyDetailPdf}>
                <Text style={styles.secondaryButtonText}>Gün Gün Detay PDF</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={downloadWorkerClaimFilePdf}>
                <Text style={styles.secondaryButtonText}>İşçi Alacağı Dosyası PDF</Text>
              </Pressable>
            </View>

            <SummaryCard title="Hızlı Maaş / Yan Hak Girişi">
              <Text style={styles.helper}>
                Bu alanlar kullanıcıya açıktır. Maaş, yemek, yol, saat ve katsayı değişince hesaplama anında güncellenir.
              </Text>
              <InfoRow
                label="Bu ay kullanılan dönem"
                value={
                  activeSalaryHistoryEntry
                    ? `${activeSalaryHistoryEntry.startMonth} - ${activeSalaryHistoryEntry.endMonth || "devam"}`
                    : "Genel varsayılan"
                }
              />

              <Text style={styles.label}>Aylık net maaş</Text>
              <NumericInput
                value={effectiveSettings.monthlySalary}
                onCommit={(value) => setCurrentMonthSalaryNumber("monthlySalary", value)}
              />

              <Text style={styles.label}>Aylık yemek parası</Text>
              <NumericInput
                value={effectiveSettings.monthlyMealAllowance}
                onCommit={(value) => setCurrentMonthSalaryNumber("monthlyMealAllowance", value)}
              />

              <Text style={styles.label}>Aylık yol parası</Text>
              <NumericInput
                value={effectiveSettings.monthlyTransportAllowance}
                onCommit={(value) => setCurrentMonthSalaryNumber("monthlyTransportAllowance", value)}
              />

              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Aylık normal saat</Text>
                  <NumericInput
                    value={effectiveSettings.monthlyBaseHours}
                    onCommit={(value) => setCurrentMonthSalaryNumber("monthlyBaseHours", value)}
                  />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Haftalık yasal saat</Text>
                  <NumericInput
                    value={effectiveSettings.weeklyOvertimeThresholdHours}
                    onCommit={(value) => setCurrentMonthSalaryNumber("weeklyOvertimeThresholdHours", value)}
                  />
                </View>
              </View>

              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Mesai katsayısı</Text>
                  <NumericInput
                    value={effectiveSettings.coefficients.overtime}
                    onCommit={(value) => setCurrentMonthSalaryCoefficient("overtime", value)}
                  />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Pazar katsayısı</Text>
                  <NumericInput
                    value={effectiveSettings.coefficients.sunday}
                    onCommit={(value) => setCurrentMonthSalaryCoefficient("sunday", value)}
                  />
                </View>
              </View>

              <Pressable style={styles.secondaryButton} onPress={() => setActiveTab("SETTINGS")}>
                <Text style={styles.secondaryButtonText}>Tüm Hesap Ayarlarını Aç</Text>
              </Pressable>
            </SummaryCard>

            <SummaryCard title="Dönemler">
              <InfoRow label="Hesap dönemi" value={periodText} />
              <InfoRow label="Dönem günü" value={`${summary.salaryPeriodDays}`} />
              <InfoRow label="Ödenebilir gün" value={`${summary.payableDays}`} />
              <InfoRow label="Fiili çalışılan gün" value={`${summary.workedDays}`} />
              <InfoRow label="Eksik/ödenmeyen gün" value={`${summary.nonPayableDays}`} />
              <InfoRow label="Maaş hak ediş oranı" value={`%${summary.salaryRatioPercent}`} />
              <InfoRow label="Maaş hak edişi" value={formatCurrency(summary.baseSalary)} strong />
            </SummaryCard>

            <SummaryCard title="Çalışma Durumu">
              <InfoRow label="Çalışılan gün" value={`${summary.workedDays}`} />
              <InfoRow label="İzinli gün" value={`${summary.leaveDays}`} />
              <InfoRow label="Yıllık izin" value={`${summary.annualLeaveDays}`} />
              <InfoRow label="Raporlu gün" value={`${summary.reportDays}`} />
              <InfoRow label="Tatil gün" value={`${summary.holidayOffDays}`} />
              <InfoRow label="Normal gün" value={`${summary.normalWorkedDays}`} />
              <InfoRow label="Pazar gün" value={`${summary.sundayWorkedDays}`} />
              <InfoRow label="UBGT gün" value={`${summary.ubgtWorkedDays}`} />
              <InfoRow label="Toplam çalışma saati" value={`${summary.totalHours} saat`} />
              <InfoRow label="Gece çalışma saati" value={`${summary.nightHours} saat`} />
              <InfoRow label="Günlük 7.5 saat aşımı" value={`${summary.dailyOvertimeHours} saat`} />
              <InfoRow label="Haftalık 45 saat aşımı" value={`${summary.weeklyOvertimeRawHours} saat`} />
              <InfoRow label="Haftalık ilave mesai" value={`${summary.weeklyAdditionalOvertimeHours} saat`} />
              <InfoRow label="Aylık 225 saat aşımı" value={`${summary.monthlyOvertimeRawHours} saat`} />
              <InfoRow label="Aylık ilave mesai" value={`${summary.monthlyAdditionalOvertimeHours} saat`} />
              <InfoRow label="Çifte sayım düşülmüş toplam" value={`${summary.overtimeHours} saat`} />
              <InfoRow label="Günlük ortalama mesai" value={`${summary.averageDailyOvertime} saat`} />
            </SummaryCard>

            <SummaryCard title="Hak Ediş">
              <InfoRow label="Saatlik ücret" value={formatCurrency(summary.hourlyRate)} />
              <InfoRow label="Fazla mesai katsayısı" value={`${effectiveSettings.coefficients.overtime}`} />
              <InfoRow label="Maaş hak edişi" value={formatCurrency(summary.baseSalary)} />
              <InfoRow label="Dönem kesintisi" value={formatCurrency(summary.reportDeduction)} />
              <InfoRow label="Mesai hak edişi" value={formatCurrency(summary.overtimePay)} />
              <InfoRow label="Pazar hak edişi" value={formatCurrency(summary.sundayPay)} />
              <InfoRow label="UBGT hak edişi" value={formatCurrency(summary.ubgtPay)} />
              <InfoRow label="Gece primi" value={formatCurrency(summary.nightPremiumPay)} />
            </SummaryCard>

            <SummaryCard title="Yemek / Yol">
              <InfoRow label="Aylık yemek" value={formatCurrency(summary.monthlyMealAllowance)} />
              <InfoRow label="Aylık yol" value={formatCurrency(summary.monthlyTransportAllowance)} />
              <InfoRow label="Yemek hak edilen gün" value={`${summary.mealEntitledDays}`} />
              <InfoRow label="Yol hak edilen gün" value={`${summary.transportEntitledDays}`} />
              <InfoRow label="Yemek günlük oran" value={formatCurrency(summary.mealDailyRate)} />
              <InfoRow label="Yol günlük oran" value={formatCurrency(summary.transportDailyRate)} />
              <InfoRow label="Yemek hak edişi" value={formatCurrency(summary.mealTotal)} />
              <InfoRow label="Yol hak edişi" value={formatCurrency(summary.transportTotal)} />
              <InfoRow label="Toplam yan hak" value={formatCurrency(summary.sideBenefitsTotal)} strong />
            </SummaryCard>

            <SummaryCard title="Eksik / Fazla">
              {isMonthClosed ? <Text style={styles.error}>Ay kapalı olduğu için ödemeler değiştirilemez.</Text> : null}

              <Text style={styles.label}>Yatırılan maaş</Text>
              <TextInput
                value={paymentInputs.salary}
                onChangeText={(value) => updateMonthPaymentInput("salary", value)}
                onFocus={() => setFocusedPaymentField("salary")}
                onBlur={() => commitMonthPayment()}
                keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>Yatırılan mesai</Text>
              <TextInput
                value={paymentInputs.overtime}
                onChangeText={(value) => updateMonthPaymentInput("overtime", value)}
                onFocus={() => setFocusedPaymentField("overtime")}
                onBlur={() => commitMonthPayment()}
                keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>Yatırılan pazar</Text>
              <TextInput
                value={paymentInputs.sunday}
                onChangeText={(value) => updateMonthPaymentInput("sunday", value)}
                onFocus={() => setFocusedPaymentField("sunday")}
                onBlur={() => commitMonthPayment()}
                keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>Yatırılan UBGT</Text>
              <TextInput
                value={paymentInputs.ubgt}
                onChangeText={(value) => updateMonthPaymentInput("ubgt", value)}
                onFocus={() => setFocusedPaymentField("ubgt")}
                onBlur={() => commitMonthPayment()}
                keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>Yatırılan yemek</Text>
              <TextInput
                value={paymentInputs.meal}
                onChangeText={(value) => updateMonthPaymentInput("meal", value)}
                onFocus={() => setFocusedPaymentField("meal")}
                onBlur={() => commitMonthPayment()}
                keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>Yatırılan yol</Text>
              <TextInput
                value={paymentInputs.transport}
                onChangeText={(value) => updateMonthPaymentInput("transport", value)}
                onFocus={() => setFocusedPaymentField("transport")}
                onBlur={() => commitMonthPayment()}
                keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Pressable
                style={[styles.secondaryButton, isMonthClosed ? styles.buttonDisabled : null]}
                onPress={saveMonthPayment}
                disabled={isMonthClosed}
              >
                <Text style={styles.secondaryButtonText}>Ödemeyi Kaydet</Text>
              </Pressable>

              <InfoRow label="Toplam hak ediş" value={formatCurrency(summary.expectedTotal)} strong />
              <InfoRow label="Ödeme geçmişi toplamı" value={formatCurrency(summary.transactionPaidTotal)} />
              <InfoRow label="Yatırılan toplam" value={formatCurrency(summary.paidTotal)} strong />
              <InfoRow
                label="Fark"
                value={`${formatSignedCurrency(summary.difference)} (${monthlyDifferenceLabel(summary.difference)})`}
                strong
                valueColor={differenceColor(summary.difference)}
              />
            </SummaryCard>

            <SummaryCard title="Ödeme Geçmişi">
              <Text style={styles.helper}>Banka, elden, avans, muhasebeci veya farklı kişi ödemelerini tarih tarih girin.</Text>
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Tarih</Text>
                  <TextInput value={paymentForm.date} onChangeText={(value) => setPaymentForm((prev) => ({ ...prev, date: value }))} style={styles.input} placeholder={`${monthKey}-01`} />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Tutar</Text>
                  <TextInput value={paymentForm.amount} onChangeText={(value) => setPaymentForm((prev) => ({ ...prev, amount: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} />
                </View>
              </View>
              <Text style={styles.label}>Ödeme türü</Text>
              <View style={styles.optionWrap}>
                {[
                  ["BANK", "Banka"],
                  ["CASH", "Elden"],
                  ["ADVANCE", "Avans"],
                  ["ACCOUNTANT", "Muhasebeci"],
                  ["OTHER_PERSON", "Başka kişi"],
                  ["OTHER", "Diğer"]
                ].map(([value, label]) => (
                  <Pressable key={value} style={[styles.optionButton, paymentForm.kind === value ? styles.optionButtonActive : null]} onPress={() => setPaymentForm((prev) => ({ ...prev, kind: value }))}>
                    <Text style={[styles.optionButtonText, paymentForm.kind === value ? styles.optionButtonTextActive : null]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Açıklama</Text>
              <TextInput value={paymentForm.description} onChangeText={(value) => setPaymentForm((prev) => ({ ...prev, description: value }))} style={styles.input} />
              <Pressable style={styles.secondaryButton} onPress={addPaymentTransaction}>
                <Text style={styles.secondaryButtonText}>Ödeme Ekle</Text>
              </Pressable>
              {currentMonthTransactions.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <InfoRow label={`${item.date} | ${item.kind}`} value={formatCurrency(item.amount)} strong />
                  {item.description ? <Text style={styles.helper}>{item.description}</Text> : null}
                  <Pressable style={styles.deleteButton} onPress={() => deletePaymentTransaction(item.id)}>
                    <Text style={styles.deleteButtonText}>Sil</Text>
                  </Pressable>
                </View>
              ))}
            </SummaryCard>

            <SummaryCard title="Bordro Karşılaştırma">
              <Text style={styles.helper}>Bordroda görünen tutarları girin; uygulama gerçek hak ediş ile farkı gösterir.</Text>
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}><Text style={styles.label}>Bordro net maaş</Text><TextInput value={statementForm.bordroNetSalary} onChangeText={(value) => setStatementForm((prev) => ({ ...prev, bordroNetSalary: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} /></View>
                <View style={styles.gridField}><Text style={styles.label}>Bordro mesai</Text><TextInput value={statementForm.bordroOvertime} onChangeText={(value) => setStatementForm((prev) => ({ ...prev, bordroOvertime: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} /></View>
              </View>
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}><Text style={styles.label}>Bordro Pazar</Text><TextInput value={statementForm.bordroSunday} onChangeText={(value) => setStatementForm((prev) => ({ ...prev, bordroSunday: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} /></View>
                <View style={styles.gridField}><Text style={styles.label}>Bordro UBGT</Text><TextInput value={statementForm.bordroUbgt} onChangeText={(value) => setStatementForm((prev) => ({ ...prev, bordroUbgt: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} /></View>
              </View>
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}><Text style={styles.label}>Bordro yemek</Text><TextInput value={statementForm.bordroMeal} onChangeText={(value) => setStatementForm((prev) => ({ ...prev, bordroMeal: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} /></View>
                <View style={styles.gridField}><Text style={styles.label}>Bordro yol</Text><TextInput value={statementForm.bordroTransport} onChangeText={(value) => setStatementForm((prev) => ({ ...prev, bordroTransport: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} /></View>
              </View>
              <Text style={styles.label}>Not</Text>
              <TextInput value={statementForm.note} onChangeText={(value) => setStatementForm((prev) => ({ ...prev, note: value }))} style={styles.input} />
              <Pressable style={styles.secondaryButton} onPress={savePayrollStatement}>
                <Text style={styles.secondaryButtonText}>Bordro Bilgisini Kaydet</Text>
              </Pressable>
              <InfoRow label="Bordro toplamı" value={formatCurrency(summary.statementTotal)} />
              <InfoRow label="Gerçek hak ediş" value={formatCurrency(summary.expectedTotal)} />
              <InfoRow label="Bordro farkı" value={formatSignedCurrency(summary.statementTotal - summary.expectedTotal)} valueColor={differenceColor(summary.statementTotal - summary.expectedTotal)} strong />
              {currentMonthStatement?.note ? <Text style={styles.helper}>{currentMonthStatement.note}</Text> : null}
            </SummaryCard>

            <SummaryCard title="Delil / Belge Dosyası">
              <Text style={styles.helper}>Bordro, dekont, WhatsApp veya vardiya çizelgesi bağlantı/notlarını ay bazında tutun.</Text>
              <Text style={styles.label}>Belge tipi</Text>
              <View style={styles.optionWrap}>
                {EVIDENCE_TYPE_OPTIONS.map(({ value, label }) => (
                  <Pressable
                    key={value}
                    style={[styles.optionButton, evidenceForm.type === value ? styles.optionButtonActive : null]}
                    onPress={() => setEvidenceForm((prev) => ({ ...prev, type: value }))}
                  >
                    <Text style={[styles.optionButtonText, evidenceForm.type === value ? styles.optionButtonTextActive : null]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Başlık</Text>
              <TextInput value={evidenceForm.title} onChangeText={(value) => setEvidenceForm((prev) => ({ ...prev, title: value }))} style={styles.input} />
              <Text style={styles.label}>Belge yolu / açıklama</Text>
              <TextInput value={evidenceForm.uri} onChangeText={(value) => setEvidenceForm((prev) => ({ ...prev, uri: value }))} style={styles.input} placeholder="Dosya yolu veya kısa açıklama" />
              <Pressable style={styles.secondaryButton} onPress={pickEvidenceImage}>
                <Text style={styles.secondaryButtonText}>Galeriden Fotoğraf Seç</Text>
              </Pressable>
              {evidenceForm.uri.startsWith("file:") ? <Image source={{ uri: evidenceForm.uri }} style={styles.evidencePreview} resizeMode="cover" /> : null}
              <Text style={styles.label}>Not</Text>
              <TextInput value={evidenceForm.note} onChangeText={(value) => setEvidenceForm((prev) => ({ ...prev, note: value }))} style={styles.input} />
              <Pressable style={styles.secondaryButton} onPress={addEvidenceFile}>
                <Text style={styles.secondaryButtonText}>Belge Kaydı Ekle</Text>
              </Pressable>
              {currentMonthEvidence.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <InfoRow label={item.title} value={item.type} strong />
                  {item.uri.startsWith("file:") ? <Image source={{ uri: item.uri }} style={styles.evidencePreview} resizeMode="cover" /> : null}
                  {item.uri ? <Text style={styles.helper}>{item.uri}</Text> : null}
                  {item.note ? <Text style={styles.helper}>{item.note}</Text> : null}
                  <View style={styles.optionWrap}>
                    {item.uri ? (
                      <Pressable style={styles.optionButton} onPress={() => void openEvidenceFile(item.uri)}>
                        <Text style={styles.optionButtonText}>Aç</Text>
                      </Pressable>
                    ) : null}
                    <Pressable style={styles.optionButton} onPress={() => deleteEvidenceFile(item.id)}>
                      <Text style={styles.optionButtonText}>Sil</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </SummaryCard>

            <SummaryCard title="Toplam Alacak / Borç">
              {totalDifference < 0 ? (
                <InfoRow
                  label="Toplam alacağın"
                  value={formatCurrency(Math.abs(totalDifference))}
                  strong
                  valueColor="#b91c1c"
                />
              ) : totalDifference > 0 ? (
                <InfoRow
                  label="Fazla alınan"
                  value={formatSignedCurrency(totalDifference)}
                  strong
                  valueColor="#15803d"
                />
              ) : (
                <InfoRow label="Toplam durum" value="Eşit" strong valueColor="#475569" />
              )}
            </SummaryCard>

            <SummaryCard title="Analiz">
              <InfoRow label="Maaş ödeme günü" value={`${analytics.salaryPaymentDay}`} />
              <InfoRow label="Aylık hedef kazanç" value={formatCurrency(analytics.monthlyTarget)} />
              <InfoRow label="Hedefe ulaşma" value={`%${analytics.targetProgressPercent}`} />
              <InfoRow
                label="En çok kazandıran gün"
                value={
                  analytics.mostEarningDayKey
                    ? `${formatDateKeyTr(analytics.mostEarningDayKey)} (${formatCurrency(analytics.mostEarningDayAmount)})`
                    : "-"
                }
              />
              <InfoRow
                label="En çok çalışılan hafta günü"
                value={
                  analytics.mostWorkedWeekdayLabel
                    ? `${analytics.mostWorkedWeekdayLabel} (${analytics.mostWorkedWeekdayCount})`
                    : "-"
                }
              />
              <InfoRow label="Çalışma oranı" value={`%${analytics.workRatePercent}`} />
              <InfoRow label="Rapor oranı" value={`%${analytics.reportRatePercent}`} />
              <InfoRow label="İzin oranı" value={`%${analytics.leaveRatePercent}`} />
            </SummaryCard>

          </View>
        ) : null}

        {activeTab === "EMPLOYEE" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personel Portalı</Text>
            <Text style={styles.helper}>Bordro, puantaj, izin, avans, mesai, belge ve bildirimlerin tek ekranda.</Text>

            <View style={styles.portalHero}>
              {appData.profile.avatarUrl.trim() ? (
                <Image source={{ uri: appData.profile.avatarUrl.trim() }} style={styles.portalAvatar} />
              ) : (
                <View style={styles.portalAvatarFallback}>
                  <Text style={styles.portalAvatarText}>{profileInitials(appData.profile.fullName, authUser.username)}</Text>
                </View>
              )}
              <View style={styles.portalHeroText}>
                <Text style={styles.portalName}>{appData.profile.fullName || authUser.username}</Text>
                <Text style={styles.helper}>{appData.employeePortal.position || "Pozisyon girilmedi"} • {appData.employeePortal.department || "Departman girilmedi"}</Text>
              </View>
            </View>

            <View style={styles.kpiGrid}>
              <View style={styles.kpiTile}>
                <Text style={styles.kpiValue}>{formatCurrency(summary.expectedTotal)}</Text>
                <Text style={styles.kpiLabel}>Bu ay hak ediş</Text>
              </View>
              <View style={styles.kpiTile}>
                <Text style={[styles.kpiValue, { color: differenceColor(summary.difference) }]}>{formatSignedCurrency(summary.difference)}</Text>
                <Text style={styles.kpiLabel}>Bordro/ödeme farkı</Text>
              </View>
              <View style={styles.kpiTile}>
                <Text style={styles.kpiValue}>{summary.overtimeHours} sa</Text>
                <Text style={styles.kpiLabel}>Fazla mesai</Text>
              </View>
              <View style={styles.kpiTile}>
                <Text style={styles.kpiValue}>{appData.employeePortal.leaveBalanceDays} gün</Text>
                <Text style={styles.kpiLabel}>İzin bakiyesi</Text>
              </View>
            </View>

            <SummaryCard title="Kontrol Merkezi">
              {employeeHealthChecks.map((item) => (
                <InfoRow
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  strong
                  valueColor={item.tone === "OK" ? "#22c55e" : item.tone === "WARN" ? "#fbbf24" : "#f87171"}
                />
              ))}
              {analytics.salaryWarning ? <Text style={styles.error}>{analytics.salaryWarning}</Text> : null}
              <Text style={styles.helper}>
                Hesaplamalar bu ayın puantajı, ödeme kayıtları, ücret geçmişi ve yan hak ayarlarına göre üretilir.
              </Text>
            </SummaryCard>

            <SummaryCard title="Bordro ve Puantaj">
              <InfoRow label="Çalışılan gün" value={`${summary.workedDays}`} />
              <InfoRow label="Yıllık izin / rapor" value={`${summary.annualLeaveDays} / ${summary.reportDays}`} />
              <InfoRow label="Yemek + yol" value={formatCurrency(summary.sideBenefitsTotal)} />
              <InfoRow label="Yatırılan toplam" value={formatCurrency(summary.paidTotal)} />
              <View style={styles.optionWrap}>
                <Pressable style={styles.secondaryButton} onPress={downloadSalarySummaryPdf}>
                  <Text style={styles.secondaryButtonText}>Bordro PDF</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={downloadPuantajSummaryPdf}>
                  <Text style={styles.secondaryButtonText}>Puantaj PDF</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={downloadEmployeePortalPdf}>
                  <Text style={styles.secondaryButtonText}>Personel Özeti PDF</Text>
                </Pressable>
              </View>
            </SummaryCard>

            <SummaryCard title="Yeni Talep">
              <Text style={styles.label}>Talep tipi</Text>
              <View style={styles.optionWrap}>
                {EMPLOYEE_REQUEST_TYPE_OPTIONS.map(({ value, label }) => (
                  <Pressable
                    key={value}
                    style={[styles.optionButton, employeeRequestForm.type === value ? styles.optionButtonActive : null]}
                    onPress={() => setEmployeeRequestForm((prev) => ({ ...prev, type: value }))}
                  >
                    <Text style={[styles.optionButtonText, employeeRequestForm.type === value ? styles.optionButtonTextActive : null]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Başlık</Text>
              <TextInput value={employeeRequestForm.title} onChangeText={(value) => setEmployeeRequestForm((prev) => ({ ...prev, title: value }))} style={styles.input} placeholder="Örn: 2 günlük yıllık izin" />
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Başlangıç</Text>
                  <TextInput value={employeeRequestForm.startDate} onChangeText={(value) => setEmployeeRequestForm((prev) => ({ ...prev, startDate: value }))} style={styles.input} placeholder="2026-05-10" />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Bitiş</Text>
                  <TextInput value={employeeRequestForm.endDate} onChangeText={(value) => setEmployeeRequestForm((prev) => ({ ...prev, endDate: value }))} style={styles.input} placeholder="2026-05-12" />
                </View>
              </View>
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Tutar</Text>
                  <TextInput value={employeeRequestForm.amount} onChangeText={(value) => setEmployeeRequestForm((prev) => ({ ...prev, amount: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} placeholder="Avans/masraf" />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Saat</Text>
                  <TextInput value={employeeRequestForm.hours} onChangeText={(value) => setEmployeeRequestForm((prev) => ({ ...prev, hours: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} placeholder="Mesai saati" />
                </View>
              </View>
              <Text style={styles.label}>Açıklama</Text>
              <TextInput value={employeeRequestForm.note} onChangeText={(value) => setEmployeeRequestForm((prev) => ({ ...prev, note: value }))} style={[styles.input, { minHeight: 74, textAlignVertical: "top" }]} multiline />
              <Pressable style={styles.primaryButton} onPress={addEmployeeRequest}>
                <Text style={styles.primaryButtonText}>Talep Oluştur</Text>
              </Pressable>
            </SummaryCard>

            <SummaryCard title="Talep Geçmişi">
              {employeeRequests.length === 0 ? <Text style={styles.helper}>Henüz talep kaydı yok.</Text> : null}
              {employeeRequests.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <InfoRow label={item.title} value={EMPLOYEE_REQUEST_STATUS_LABELS[item.status]} strong valueColor={item.status === "APPROVED" ? "#22c55e" : item.status === "REJECTED" ? "#f87171" : "#fbbf24"} />
                  <Text style={styles.helper}>{item.createdAt.slice(0, 10)} • {EMPLOYEE_REQUEST_TYPE_OPTIONS.find((option) => option.value === item.type)?.label}</Text>
                  {item.startDate || item.endDate ? <Text style={styles.helper}>Tarih: {item.startDate || "-"} / {item.endDate || "-"}</Text> : null}
                  {item.amount > 0 ? <Text style={styles.helper}>Tutar: {formatCurrency(item.amount)}</Text> : null}
                  {item.hours > 0 ? <Text style={styles.helper}>Saat: {item.hours}</Text> : null}
                  {item.note ? <Text style={styles.helper}>{item.note}</Text> : null}
                  <View style={styles.optionWrap}>
                    <Pressable style={styles.optionButton} onPress={() => updateEmployeeRequestStatus(item.id, "APPROVED")}>
                      <Text style={styles.optionButtonText}>Onayla</Text>
                    </Pressable>
                    <Pressable style={styles.optionButton} onPress={() => updateEmployeeRequestStatus(item.id, "REJECTED")}>
                      <Text style={styles.optionButtonText}>Reddet</Text>
                    </Pressable>
                    <Pressable style={styles.optionButton} onPress={() => updateEmployeeRequestStatus(item.id, "CANCELLED")}>
                      <Text style={styles.optionButtonText}>İptal</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </SummaryCard>

            <SummaryCard title="Profil, IBAN ve Acil Kişi">
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Departman</Text>
                  <TextInput value={appData.employeePortal.department} onChangeText={(value) => setEmployeePortalField("department", value)} style={styles.input} />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Pozisyon</Text>
                  <TextInput value={appData.employeePortal.position} onChangeText={(value) => setEmployeePortalField("position", value)} style={styles.input} />
                </View>
              </View>
              <Text style={styles.label}>IBAN</Text>
              <TextInput value={appData.employeePortal.iban} onChangeText={(value) => setEmployeePortalField("iban", value)} style={styles.input} autoCapitalize="characters" />
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Acil kişi</Text>
                  <TextInput value={appData.employeePortal.emergencyContactName} onChangeText={(value) => setEmployeePortalField("emergencyContactName", value)} style={styles.input} />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Acil telefon</Text>
                  <TextInput value={appData.employeePortal.emergencyContactPhone} onChangeText={(value) => setEmployeePortalField("emergencyContactPhone", value)} style={styles.input} keyboardType="phone-pad" />
                </View>
              </View>
              <Text style={styles.label}>İzin bakiyesi</Text>
              <TextInput value={String(appData.employeePortal.leaveBalanceDays)} onChangeText={(value) => setEmployeePortalField("leaveBalanceDays", value)} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} />
            </SummaryCard>

            <SummaryCard title="Belge Arşivi">
              <Text style={styles.label}>Belge tipi</Text>
              <View style={styles.optionWrap}>
                {EMPLOYEE_DOCUMENT_TYPE_OPTIONS.map(({ value, label }) => (
                  <Pressable
                    key={value}
                    style={[styles.optionButton, employeeDocumentForm.type === value ? styles.optionButtonActive : null]}
                    onPress={() => setEmployeeDocumentForm((prev) => ({ ...prev, type: value }))}
                  >
                    <Text style={[styles.optionButtonText, employeeDocumentForm.type === value ? styles.optionButtonTextActive : null]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Başlık</Text>
              <TextInput value={employeeDocumentForm.title} onChangeText={(value) => setEmployeeDocumentForm((prev) => ({ ...prev, title: value }))} style={styles.input} />
              <Text style={styles.label}>Dosya yolu / açıklama</Text>
              <TextInput value={employeeDocumentForm.uri} onChangeText={(value) => setEmployeeDocumentForm((prev) => ({ ...prev, uri: value }))} style={styles.input} />
              <Pressable style={styles.secondaryButton} onPress={pickEmployeeDocumentImage}>
                <Text style={styles.secondaryButtonText}>Galeriden Belge Seç</Text>
              </Pressable>
              {employeeDocumentForm.uri.startsWith("file:") ? <Image source={{ uri: employeeDocumentForm.uri }} style={styles.evidencePreview} resizeMode="cover" /> : null}
              <Text style={styles.label}>Not</Text>
              <TextInput value={employeeDocumentForm.note} onChangeText={(value) => setEmployeeDocumentForm((prev) => ({ ...prev, note: value }))} style={styles.input} />
              <Pressable style={styles.secondaryButton} onPress={addEmployeeDocument}>
                <Text style={styles.secondaryButtonText}>Belge Ekle</Text>
              </Pressable>
              {appData.employeePortal.documents.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <InfoRow label={item.title} value={EMPLOYEE_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === item.type)?.label ?? item.type} strong />
                  {item.uri.startsWith("file:") ? <Image source={{ uri: item.uri }} style={styles.evidencePreview} resizeMode="cover" /> : null}
                  {item.uri ? <Text style={styles.helper}>{item.uri}</Text> : null}
                  {item.note ? <Text style={styles.helper}>{item.note}</Text> : null}
                  <View style={styles.optionWrap}>
                    {item.uri ? (
                      <Pressable style={styles.optionButton} onPress={() => void openEvidenceFile(item.uri)}>
                        <Text style={styles.optionButtonText}>Aç</Text>
                      </Pressable>
                    ) : null}
                    <Pressable style={styles.optionButton} onPress={() => deleteEmployeeDocument(item.id)}>
                      <Text style={styles.optionButtonText}>Sil</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </SummaryCard>

            <SummaryCard title={`Bildirimler${unreadEmployeeNotifications ? ` (${unreadEmployeeNotifications})` : ""}`}>
              <Pressable style={styles.secondaryButton} onPress={markEmployeeNotificationsRead}>
                <Text style={styles.secondaryButtonText}>Tümünü Okundu Yap</Text>
              </Pressable>
              {appData.employeePortal.notifications.length === 0 ? <Text style={styles.helper}>Bildirim yok.</Text> : null}
              {appData.employeePortal.notifications.slice(0, 8).map((item) => (
                <View key={item.id} style={[styles.notificationItem, item.read ? null : styles.notificationUnread]}>
                  <Text style={styles.notificationTitle}>{item.title}</Text>
                  <Text style={styles.helper}>{item.message}</Text>
                  <Text style={styles.helper}>{item.createdAt.slice(0, 10)}</Text>
                </View>
              ))}
            </SummaryCard>
          </View>
        ) : null}

        {activeTab === "APP_SETTINGS" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ayarlar</Text>
            <SummaryCard title="Hesap Bilgisi">
              <InfoRow label="Kullanıcı" value={authUser.username} />
              <InfoRow label="Rol" value={authUser.role === "ADMIN" ? "Yönetici" : "Kullanıcı"} />
            </SummaryCard>
            <SummaryCard title="Kişisel Bilgiler">
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
                <Text style={styles.helper}>Profil fotoğrafını galeriden seçebilirsiniz.</Text>
              </View>

              <View style={styles.row}>
                <Pressable style={[styles.secondaryButton, styles.flexInput]} onPress={() => void pickProfileImage()}>
                  <Text style={styles.secondaryButtonText}>Galeriden Fotoğraf Seç</Text>
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
                    <Text style={styles.deleteButtonText}>Fotoğrafı Kaldır</Text>
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
                <Text style={styles.deleteButtonText}>Kişisel Bilgileri Temizle</Text>
              </Pressable>
            </SummaryCard>
            <SummaryCard title="Güvenlik">
              <Text style={styles.helper}>
                Hesabınız bu cihazda güvenli şekilde tutulur. Çıkış yaptığınızda oturum kapatılır.
              </Text>
              {authUser.role === "USER" ? (
                <>
                  <Text style={styles.label}>Hesap silme için şifre</Text>
                  <TextInput
                    value={deleteAccountPassword}
                    onChangeText={setDeleteAccountPassword}
                    style={styles.input}
                    secureTextEntry
                    placeholder="Şifrenizi girin"
                  />
                  <Text style={styles.label}>Hesap silme için güvenlik cevabı</Text>
                  <TextInput
                    value={deleteAccountSecurityAnswer}
                    onChangeText={setDeleteAccountSecurityAnswer}
                    style={styles.input}
                    placeholder="Güvenlik cevabı"
                  />
                  <Pressable style={styles.deleteButton} onPress={handleDeleteOwnAccount}>
                    <Text style={styles.deleteButtonText}>Hesabı Sil</Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable style={styles.deleteButton} onPress={handleLogout}>
                <Text style={styles.deleteButtonText}>Çıkış Yap</Text>
              </Pressable>
            </SummaryCard>
          </View>
        ) : null}

        {activeTab === "SUPPORT" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Destek</Text>
            <SummaryCard title="İletişime Geç">
              <Text style={styles.helper}>
                Sorununuzu kısa ve net yazarak destek talebi oluşturabilirsiniz.
              </Text>
              <InfoRow label="Destek e-posta" value="yusufavsarsgu@gmail.com" />
              <InfoRow label="Çalışma saati" value="09:00 - 18:00" />
              <Text style={styles.label}>Konu</Text>
              <TextInput
                value={supportSubject}
                onChangeText={setSupportSubject}
                style={styles.input}
                placeholder="Örn: Giriş sorunu"
              />
              <Text style={styles.label}>Mesaj</Text>
              <TextInput
                value={supportMessage}
                onChangeText={setSupportMessage}
                style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
                multiline
                placeholder="Yaşadığınız sorunu yazın"
              />
              <Pressable style={styles.secondaryButton} onPress={() => void openSupportContact()}>
                <Text style={styles.secondaryButtonText}>Destek Talebi Oluştur</Text>
              </Pressable>
            </SummaryCard>
          </View>
        ) : null}

        {activeTab === "SETTINGS" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Maaş ve Hesap Ayarları</Text>
            <Text style={styles.helper}>
              Maaş, yan hak, saat eşiği ve katsayıları buradan değiştirin. Değişiklikler bu kullanıcının hesaplamalarına uygulanır.
            </Text>

            <SummaryCard title="Maaş Geçmişi">
              <Text style={styles.helper}>
                Geçmiş yıllar ve aylar için maaş dönemleri tanımlayın. Hesaplama seçili aya göre doğru maaşı otomatik kullanır.
              </Text>
              <InfoRow
                label="Seçili ayda kullanılan"
                value={
                  activeSalaryHistoryEntry
                    ? `${activeSalaryHistoryEntry.startMonth} - ${activeSalaryHistoryEntry.endMonth || "devam"}`
                    : "Genel varsayılan ayarlar"
                }
              />

              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Başlangıç ayı</Text>
                  <TextInput
                    value={salaryHistoryForm.startMonth}
                    onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, startMonth: value }))}
                    style={styles.input}
                    placeholder="2025-01"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Bitiş ayı</Text>
                  <TextInput
                    value={salaryHistoryForm.endMonth}
                    onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, endMonth: value }))}
                    style={styles.input}
                    placeholder="Boşsa devam eder"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Net maaş</Text>
                  <TextInput
                    value={salaryHistoryForm.monthlySalary}
                    onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, monthlySalary: value }))}
                    style={styles.input}
                    keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                  />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Aylık normal saat</Text>
                  <TextInput
                    value={salaryHistoryForm.monthlyBaseHours}
                    onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, monthlyBaseHours: value }))}
                    style={styles.input}
                    keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                  />
                </View>
              </View>

              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Yemek</Text>
                  <TextInput
                    value={salaryHistoryForm.monthlyMealAllowance}
                    onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, monthlyMealAllowance: value }))}
                    style={styles.input}
                    keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                  />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Yol</Text>
                  <TextInput
                    value={salaryHistoryForm.monthlyTransportAllowance}
                    onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, monthlyTransportAllowance: value }))}
                    style={styles.input}
                    keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                  />
                </View>
              </View>

              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Haftalık yasal saat</Text>
                  <TextInput
                    value={salaryHistoryForm.weeklyOvertimeThresholdHours}
                    onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, weeklyOvertimeThresholdHours: value }))}
                    style={styles.input}
                    keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                  />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Günlük mesai eşiği</Text>
                  <TextInput
                    value={salaryHistoryForm.dailyOvertimeThresholdHours}
                    onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, dailyOvertimeThresholdHours: value }))}
                    style={styles.input}
                    keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                  />
                </View>
              </View>

              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Mesai katsayısı</Text>
                  <TextInput
                    value={salaryHistoryForm.overtimeCoefficient}
                    onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, overtimeCoefficient: value }))}
                    style={styles.input}
                    keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                  />
                </View>
                <View style={styles.gridField}>
                  <Text style={styles.label}>Pazar katsayısı</Text>
                  <TextInput
                    value={salaryHistoryForm.sundayCoefficient}
                    onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, sundayCoefficient: value }))}
                    style={styles.input}
                    keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
                  />
                </View>
              </View>

              <Text style={styles.label}>UBGT katsayısı</Text>
              <TextInput
                value={salaryHistoryForm.ubgtCoefficient}
                onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, ubgtCoefficient: value }))}
                style={styles.input}
                keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"}
              />

              <Text style={styles.label}>Not</Text>
              <TextInput
                value={salaryHistoryForm.note}
                onChangeText={(value) => setSalaryHistoryForm((prev) => ({ ...prev, note: value }))}
                style={styles.input}
                placeholder="Örn: 2025 zam dönemi"
              />

              <View style={styles.row}>
                <Pressable style={styles.secondaryButton} onPress={saveSalaryHistoryEntry}>
                  <Text style={styles.secondaryButtonText}>{salaryHistoryEditingId ? "Dönemi Güncelle" : "Dönem Ekle"}</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={resetSalaryHistoryForm}>
                  <Text style={styles.secondaryButtonText}>Formu Temizle</Text>
                </Pressable>
              </View>

              {appData.salaryHistory.length === 0 ? (
                <Text style={styles.helper}>Henüz maaş geçmişi yok. İlk dönem kaydını ekleyin.</Text>
              ) : null}
              {appData.salaryHistory.map((entry) => (
                <View key={entry.id} style={styles.historyItem}>
                  <InfoRow label="Dönem" value={`${entry.startMonth} - ${entry.endMonth || "devam"}`} strong />
                  <InfoRow label="Maaş" value={formatCurrency(entry.monthlySalary)} />
                  <InfoRow label="Yemek / Yol" value={`${formatCurrency(entry.monthlyMealAllowance)} / ${formatCurrency(entry.monthlyTransportAllowance)}`} />
                  <InfoRow label="Saat / Katsayı" value={`${entry.monthlyBaseHours} saat | FM ${entry.coefficients.overtime} | Pazar ${entry.coefficients.sunday} | UBGT ${entry.coefficients.ubgt}`} />
                  {entry.note ? <Text style={styles.helper}>{entry.note}</Text> : null}
                  <View style={styles.row}>
                    <Pressable style={styles.secondaryButton} onPress={() => editSalaryHistoryEntry(entry)}>
                      <Text style={styles.secondaryButtonText}>Düzenle</Text>
                    </Pressable>
                    <Pressable style={styles.deleteButton} onPress={() => deleteSalaryHistoryEntry(entry.id)}>
                      <Text style={styles.deleteButtonText}>Sil</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </SummaryCard>

            <SummaryCard title="Vardiya Şablonları">
              <Text style={styles.helper}>Sık kullanılan vardiyaları kaydedin, takvimde güne tek dokunuşla uygulayın.</Text>
              <Text style={styles.label}>Şablon adı</Text>
              <TextInput value={shiftTemplateForm.name} onChangeText={(value) => setShiftTemplateForm((prev) => ({ ...prev, name: value }))} style={styles.input} placeholder="Örn: 12 saat gece" />
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}><Text style={styles.label}>Başlangıç</Text><TextInput value={shiftTemplateForm.start} onChangeText={(value) => setShiftTemplateForm((prev) => ({ ...prev, start: value }))} style={styles.input} placeholder="20:00" /></View>
                <View style={styles.gridField}><Text style={styles.label}>Bitiş</Text><TextInput value={shiftTemplateForm.end} onChangeText={(value) => setShiftTemplateForm((prev) => ({ ...prev, end: value }))} style={styles.input} placeholder="08:00" /></View>
              </View>
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridField}><Text style={styles.label}>Toplam saat</Text><TextInput value={shiftTemplateForm.totalHours} onChangeText={(value) => setShiftTemplateForm((prev) => ({ ...prev, totalHours: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} /></View>
                <View style={styles.gridField}><Text style={styles.label}>Mola dakika</Text><TextInput value={shiftTemplateForm.breakMinutes} onChangeText={(value) => setShiftTemplateForm((prev) => ({ ...prev, breakMinutes: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} /></View>
              </View>
              <Text style={styles.label}>Manuel mesai saat</Text>
              <TextInput value={shiftTemplateForm.manualOvertimeHours} onChangeText={(value) => setShiftTemplateForm((prev) => ({ ...prev, manualOvertimeHours: value }))} style={styles.input} keyboardType={Platform.OS === "android" ? "visible-password" : "decimal-pad"} />
              <Text style={styles.label}>Not</Text>
              <TextInput value={shiftTemplateForm.note} onChangeText={(value) => setShiftTemplateForm((prev) => ({ ...prev, note: value }))} style={styles.input} />
              <Pressable style={styles.secondaryButton} onPress={addShiftTemplate}>
                <Text style={styles.secondaryButtonText}>Şablon Ekle</Text>
              </Pressable>
              {appData.shiftTemplates.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <InfoRow label={item.name} value={`${item.start}-${item.end} | ${item.totalHours} saat`} strong />
                  <InfoRow label="Mola / Mesai" value={`${item.breakMinutes} dk / ${item.manualOvertimeHours} saat`} />
                </View>
              ))}
            </SummaryCard>

            <Text style={styles.label}>Bordro baz aylık ücret</Text>
            <NumericInput
              value={appData.settings.monthlySalary}
              onCommit={(value) => setNumericSetting("monthlySalary", value)}
            />

            <Text style={styles.label}>Aylık baz saat</Text>
            <NumericInput
              value={appData.settings.monthlyBaseHours}
              onCommit={(value) => setNumericSetting("monthlyBaseHours", value)}
            />

            <Text style={styles.label}>Haftalık fazla mesai eşiği</Text>
            <NumericInput
              value={appData.settings.weeklyOvertimeThresholdHours}
              onCommit={(value) => setNumericSetting("weeklyOvertimeThresholdHours", value)}
            />

            <Text style={styles.label}>Günlük fazla mesai eşiği</Text>
            <NumericInput
              value={appData.settings.dailyOvertimeThresholdHours}
              onCommit={(value) => setNumericSetting("dailyOvertimeThresholdHours", value)}
            />

            <Text style={styles.label}>Mesai katsayısı</Text>
            <NumericInput
              value={appData.settings.coefficients.overtime}
              onCommit={(value) => setCoefficient("overtime", value)}
            />

            <Text style={styles.label}>Pazar katsayısı</Text>
            <NumericInput
              value={appData.settings.coefficients.sunday}
              onCommit={(value) => setCoefficient("sunday", value)}
            />

            <Text style={styles.label}>UBGT katsayısı</Text>
            <NumericInput
              value={appData.settings.coefficients.ubgt}
              onCommit={(value) => setCoefficient("ubgt", value)}
            />

            <Text style={styles.label}>Gece zammı oranı</Text>
            <NumericInput
              value={appData.settings.nightPremiumRate}
              onCommit={(value) => setNumericSetting("nightPremiumRate", value)}
              placeholder="0.25"
            />

            <Text style={styles.label}>Varsayılan vardiya başlangıcı</Text>
            <TextInput
              value={appData.settings.defaultShiftStart}
              onChangeText={(value) => setStringSetting("defaultShiftStart", value)}
              style={styles.input}
              placeholder="20:00"
            />

            <Text style={styles.label}>Varsayılan vardiya bitişi</Text>
            <TextInput
              value={appData.settings.defaultShiftEnd}
              onChangeText={(value) => setStringSetting("defaultShiftEnd", value)}
              style={styles.input}
              placeholder="08:00"
            />

            <Text style={styles.label}>Varsayılan toplam saat</Text>
            <NumericInput
              value={appData.settings.defaultShiftHours}
              onCommit={(value) => setNumericSetting("defaultShiftHours", value)}
            />

            <Text style={styles.label}>Varsayılan mesai saat</Text>
            <NumericInput
              value={appData.settings.defaultOvertimeHours}
              onCommit={(value) => setNumericSetting("defaultOvertimeHours", value)}
            />

            <Text style={styles.label}>Aylık yemek parası</Text>
            <NumericInput
              value={appData.settings.monthlyMealAllowance}
              onCommit={(value) => setNumericSetting("monthlyMealAllowance", value)}
            />

            <Text style={styles.label}>Aylık yol parası</Text>
            <NumericInput
              value={appData.settings.monthlyTransportAllowance}
              onCommit={(value) => setNumericSetting("monthlyTransportAllowance", value)}
            />

            <Text style={styles.label}>Yemek/yol hak ediş yöntemi</Text>
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

            <Text style={styles.label}>Maaş ödeme günü</Text>
            <NumericInput
              value={appData.settings.salaryPaymentDay}
              onCommit={(value) => setNumericSetting("salaryPaymentDay", value)}
              placeholder="5"
            />

            <Text style={styles.label}>Aylık hedef kazanç</Text>
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
                  <Text style={styles.secondaryButtonText}>Ayı Kapat</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.secondaryButton} onPress={openMonth}>
                  <Text style={styles.secondaryButtonText}>Ayı Aç</Text>
                </Pressable>
              )}

              <Pressable style={styles.deleteButton} onPress={resetSystem}>
                <Text style={styles.deleteButtonText}>Tüm Sistemi Sıfırla</Text>
              </Pressable>
            </View>
            {authUser.role === "ADMIN" ? (
              <Pressable style={styles.deleteButton} onPress={resetEverything}>
                <Text style={styles.deleteButtonText}>Kullanıcılar Dahil Tam Sıfırla</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {activeTab === "SYNC" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Senkronizasyon</Text>
            <Text style={styles.helper}>
              Uygulama verileri güvenli şekilde eşitlenir. Teknik ayrıntılar kullanıcıya gösterilmez.
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
              <Text style={styles.secondaryButtonText}>Bağlantıyı Test Et</Text>
            </Pressable>
          </View>
        ) : null}

        {activeTab === "USERS" && authUser.role === "ADMIN" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Yönetim Paneli</Text>
            <Text style={styles.helper}>
              Yönetici işlemleri güvenli servis üzerinden yapılır ve denetim kayıtlarına işlenir.
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
              <InfoRow label="Toplam kullanıcı" value={`${adminStats?.totalUsers ?? 0}`} />
              <InfoRow label="Aktif kullanıcı" value={`${adminStats?.activeUsers ?? 0}`} />
              <InfoRow label="Banlı kullanıcı" value={`${adminStats?.bannedUsers ?? 0}`} />
              <Pressable
                style={styles.deleteButton}
                onPress={confirmPurgeUsers}
                disabled={adminBusy}
              >
                <Text style={styles.deleteButtonText}>Tüm Normal Kullanıcıları Temizle</Text>
              </Pressable>
              {(adminStats?.recentLogins ?? []).map((item) => (
                <InfoRow
                  key={item.id}
                  label={item.username}
                  value={`${item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString("tr-TR") : "-"} | ${item.lastIp ?? "-"}`}
                />
              ))}
            </SummaryCard>

            <SummaryCard title="Kullanıcı Listesi">
              <TextInput
                value={adminSearch}
                onChangeText={setAdminSearch}
                style={styles.input}
                autoCapitalize="none"
                placeholder="Kullanıcı adı ara"
              />
              <Pressable
                style={styles.secondaryButton}
                onPress={refreshAdminUsers}
                disabled={adminBusy}
              >
                <Text style={styles.secondaryButtonText}>Kullanıcı Ara / Yenile</Text>
              </Pressable>
              {adminUsers.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.summaryCard}
                  onPress={() => openAdminUserDetail(item.id)}
                >
                  <InfoRow label={item.username} value={item.role === "ADMIN" ? "Yönetici" : "Kullanıcı"} />
                  <InfoRow
                    label="Durum"
                    value={`${item.isActive ? "Aktif" : "Pasif"} / ${item.isBanned ? "Banlı" : "Ban yok"}`}
                  />
                  <InfoRow
                    label="Son giriş"
                    value={item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString("tr-TR") : "-"}
                  />
                  <InfoRow label="Kayıt tarihi" value={new Date(item.createdAt).toLocaleString("tr-TR")} />
                  <InfoRow label="Son IP" value={item.lastIp ?? "-"} />
                  <InfoRow label="Cihaz" value={item.deviceInfo ?? "-"} />
                  <InfoRow label="Hatalı giriş" value={`${item.failedLoginCount ?? 0}`} />
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
                <InfoRow label="Kayıt tarihi" value={new Date(adminSelectedUser.user.createdAt).toLocaleString("tr-TR")} />
                <InfoRow
                  label="Son giriş"
                  value={adminSelectedUser.user.lastLoginAt ? new Date(adminSelectedUser.user.lastLoginAt).toLocaleString("tr-TR") : "-"}
                />
                <Text style={styles.label}>Oturum geçmişi</Text>
                {adminSelectedUser.sessions.slice(0, 5).map((session) => (
                  <View key={session.id} style={styles.adminSessionRow}>
                    <InfoRow label="IP" value={session.ipAddress ?? "-"} />
                    <InfoRow label="Cihaz" value={session.deviceInfo ?? "-"} />
                    <InfoRow label="Başlangıç" value={new Date(session.createdAt).toLocaleString("tr-TR")} />
                    <InfoRow label="Durum" value={session.revokedAt ? "Sonlandı" : "Aktif"} />
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
                          adminBanReason || "Admin tarafından banlandı.",
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
                    <Text style={styles.optionButtonText}>Ban Kaldır</Text>
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
                    <Text style={styles.optionButtonText}>Oturumları Sonlandır</Text>
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

            <SummaryCard title="IP Ban Yönetimi">
              <Text style={styles.label}>IP adresi</Text>
              <TextInput
                value={adminIpInput}
                onChangeText={setAdminIpInput}
                style={styles.input}
                placeholder="Örn: 85.111.22.33"
                autoCapitalize="none"
              />
              <Text style={styles.label}>Sebep</Text>
              <TextInput
                value={adminIpReason}
                onChangeText={setAdminIpReason}
                style={styles.input}
                placeholder="Güvenlik ihlali"
              />
              <Pressable
                style={styles.secondaryButton}
                onPress={() =>
                  void runAdminAction(async () => {
                    if (!adminIpInput.trim()) {
                      Alert.alert("Eksik bilgi", "IP adresi boş olamaz.");
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
                <Text style={styles.helper}>Aktif IP ban kaydı bulunmuyor.</Text>
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
                      <Text style={styles.deleteButtonText}>Ban Kaldır</Text>
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
              Bu uygulamadaki bilgiler yalnızca bilgilendirme amaçlıdır. Resmî hukuki danışmanlık yerine geçmez.
            </Text>

            <SummaryCard title="İstifa / Fesih Dilekçesi Şablonu">
              <Text style={styles.label}>Şablon seçimi</Text>
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
              <Text style={styles.label}>İş yeri / ünvan</Text>
              <TextInput value={appData.legal.resignationForm.workplaceTitle} onChangeText={(v) => setResignationField("workplaceTitle", v)} style={styles.input} />
              <Text style={styles.label}>Departman</Text>
              <TextInput value={appData.legal.resignationForm.department} onChangeText={(v) => setResignationField("department", v)} style={styles.input} />
              <Text style={styles.label}>İşe giriş tarihi (01.01.2025)</Text>
              <TextInput value={appData.legal.resignationForm.hireDate} onChangeText={(v) => setResignationField("hireDate", v)} style={styles.input} keyboardType="number-pad" />
              <Text style={styles.label}>Ayrılış / fesih tarihi (01.01.2026)</Text>
              <TextInput value={appData.legal.resignationForm.leaveDate} onChangeText={(v) => setResignationField("leaveDate", v)} style={styles.input} keyboardType="number-pad" />
              <Text style={styles.label}>Dilekçe tarihi (01.01.2026)</Text>
              <TextInput value={appData.legal.resignationForm.letterDate} onChangeText={(v) => setResignationField("letterDate", v)} style={styles.input} keyboardType="number-pad" />
              <Text style={styles.label}>Açıklama</Text>
              <TextInput
                value={appData.legal.resignationForm.explanation}
                onChangeText={(v) => setResignationField("explanation", v)}
                style={[styles.input, { minHeight: 72, textAlignVertical: "top" }]}
                multiline
              />
              <Text style={styles.label}>Dilekçe metni (düzenlenebilir)</Text>
              <TextInput
                value={appData.legal.resignationForm.customDraft || generatedDraft}
                onChangeText={(v) => setResignationField("customDraft", v)}
                style={[styles.input, { minHeight: 240, textAlignVertical: "top", fontSize: 13 }]}
                multiline
              />
              <Pressable style={styles.secondaryButton} onPress={downloadResignationPdf}>
                <Text style={styles.secondaryButtonText}>İstifa/Fesih Dilekçesi PDF İndir</Text>
              </Pressable>
            </SummaryCard>

            <SummaryCard title="Kıdem / İhbar Hesaplama">
              <Text style={styles.label}>İşe giriş tarihi (01.01.2025)</Text>
              <TextInput value={appData.legal.hireDate} onChangeText={(value) => setLegalField("hireDate", value)} keyboardType="number-pad" style={styles.input} />
              <Text style={styles.label}>İşten çıkış tarihi (01.01.2026)</Text>
              <TextInput value={appData.legal.terminationDate} onChangeText={(value) => setLegalField("terminationDate", value)} keyboardType="number-pad" style={styles.input} />
              {legalDateFormatWarning ? <Text style={styles.error}>{legalDateFormatWarning}</Text> : null}

              <Text style={styles.label}>Brüt maaş</Text>
              <TextInput value={String(appData.legal.grossSalary)} onChangeText={(value) => setLegalField("grossSalary", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>Aylık yemek parası</Text>
              <TextInput value={String(appData.legal.mealAllowance)} onChangeText={(value) => setLegalField("mealAllowance", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>Aylık yol parası</Text>
              <TextInput value={String(appData.legal.transportAllowance)} onChangeText={(value) => setLegalField("transportAllowance", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>Diğer düzenli yan haklar</Text>
              <TextInput value={String(appData.legal.otherAllowance)} onChangeText={(value) => setLegalField("otherAllowance", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>Kullanılmayan izin günü</Text>
              <TextInput value={String(appData.legal.unusedAnnualLeaveDays)} onChangeText={(value) => setLegalField("unusedAnnualLeaveDays", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>Damga vergisi oranı (%)</Text>
              <TextInput value={String(appData.legal.stampTaxRate)} onChangeText={(value) => setLegalField("stampTaxRate", value)} keyboardType="numeric" style={styles.input} />
              <Text style={styles.label}>Kıdem tavanı</Text>
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

            <SummaryCard title="Hesap Sonuçları">
              <InfoRow label="Toplam çalışma süresi" value={legalResult.serviceText} />
              <InfoRow label="Kıdem tazminatı tahmini" value={formatCurrency(legalResult.severancePayNet)} />
              <InfoRow label="İhbar süresi" value={`${legalResult.noticeWeeks} hafta`} />
              <InfoRow label="İhbar tazminatı tahmini" value={formatCurrency(legalResult.noticePay)} />
              <InfoRow label="Kullanılmayan izin tahmini" value={formatCurrency(legalResult.annualLeavePay)} />
              <InfoRow label="Toplam tahmini alacak" value={formatCurrency(legalResult.estimatedTotal)} strong />
              <Pressable style={styles.secondaryButton} onPress={downloadLegalCalculationPdf}>
                <Text style={styles.secondaryButtonText}>Kıdem/İhbar PDF İndir</Text>
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
              <Text style={styles.drawerItemText}>Özet</Text>
            </Pressable>

            <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("EMPLOYEE")}>
              <Text style={styles.drawerItemText}>Personel Portalı</Text>
            </Pressable>

            <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("SETTINGS")}>
              <Text style={styles.drawerItemText}>Maaş ve Hesap</Text>
            </Pressable>
            <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("SYNC")}>
              <Text style={styles.drawerItemText}>Senkronizasyon</Text>
            </Pressable>

            <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("LEGAL")}>
              <Text style={styles.drawerItemText}>Hukuk</Text>
            </Pressable>

            {authUser.role === "ADMIN" ? (
              <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("USERS")}>
                <Text style={styles.drawerItemText}>Kullanıcılar</Text>
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
              <Text style={styles.drawerExitText}>Çıkış</Text>
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
              {selectedDateKey ? `${formatDateKeyTr(selectedDateKey)} için durum seç` : "Durum seç"}
            </Text>
            <Text style={styles.helper}>Gün türü: {dayTypeLabel(selectedDayType)}</Text>
            <Text style={styles.helper}>Mevcut durum: {dayStatusLabel(selectedDayRecord?.status ?? null)}</Text>

            {selectedDayRecord?.status === "WORKED" ? (
              <View style={styles.workInfoBox}>
                <Text style={styles.label}>Vardiya şablonu</Text>
                <View style={styles.optionWrap}>
                  {appData.shiftTemplates.map((template) => (
                    <Pressable
                      key={template.id}
                      style={styles.optionButton}
                      onPress={() => {
                        setDayEditStart(template.start);
                        setDayEditEnd(template.end);
                        setDayEditTotalHours(String(template.totalHours));
                        setDayEditBreakMinutes(String(template.breakMinutes));
                        setDayEditManualOvertime(template.manualOvertimeHours ? String(template.manualOvertimeHours) : "");
                        setDayEditNote(template.note);
                        applyShiftTemplateToSelectedDay(template);
                      }}
                      disabled={isMonthClosed}
                    >
                      <Text style={styles.optionButtonText}>{template.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.label}>Başlangıç saati</Text>
                <TextInput value={dayEditStart} onChangeText={setDayEditStart} style={styles.input} editable={!isMonthClosed} keyboardType="visible-password" placeholder="20:00" />
                <Text style={styles.label}>Bitiş saati</Text>
                <TextInput value={dayEditEnd} onChangeText={setDayEditEnd} style={styles.input} editable={!isMonthClosed} keyboardType="visible-password" placeholder="08:00" />
                <Text style={styles.label}>Toplam saat</Text>
                <TextInput value={dayEditTotalHours} onChangeText={setDayEditTotalHours} style={styles.input} editable={!isMonthClosed} keyboardType="visible-password" placeholder="12" />
                <Text style={styles.label}>Mola dakika</Text>
                <TextInput value={dayEditBreakMinutes} onChangeText={setDayEditBreakMinutes} style={styles.input} editable={!isMonthClosed} keyboardType="visible-password" placeholder="0" />
                <Text style={styles.workInfoText}>Otomatik günlük mesai: {selectedAutoDailyOvertime} saat</Text>
                <Text style={styles.label}>Manuel mesai düzeltme</Text>
                <TextInput value={dayEditManualOvertime} onChangeText={setDayEditManualOvertime} style={styles.input} editable={!isMonthClosed} keyboardType="visible-password" placeholder="Boşsa otomatik hesaplanır" />
                <Text style={styles.label}>Not</Text>
                <TextInput value={dayEditNote} onChangeText={setDayEditNote} style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]} editable={!isMonthClosed} multiline />
                <Text style={styles.helper}>
                  Yemek/Yol: {selectedDateKey && isMealTransportEligible(selectedDateKey, selectedDayType, "WORKED", appData.halfHolidayDates) ? "Hak eder" : "Hak etmez"}
                </Text>
                <Pressable style={styles.primaryButton} onPress={saveSelectedDayDetail} disabled={isMonthClosed}>
                  <Text style={styles.primaryButtonText}>Gün Detayını Kaydet</Text>
                </Pressable>
              </View>
            ) : null}

            {isMonthClosed ? <Text style={styles.error}>Bu ay kapalı, değişiklik yapılamaz.</Text> : null}

            <View style={styles.modalButtonGrid}>
              <ModalButton
                title="Çalıştım"
                onPress={() => updateDayStatus("WORKED")}
                disabled={isMonthClosed}
                tone="primary"
              />
              <ModalButton
                title="İzinli"
                onPress={() => updateDayStatus("LEAVE")}
                disabled={isMonthClosed}
                tone="secondary"
              />
              <ModalButton
                title="Yıllık İzin"
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
        {props.checked ? <Text style={styles.consentTick}>✓</Text> : null}
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
    const raw = text.trim();
    if (!raw) {
      props.onCommit("0");
      setText("0");
      setError("");
      return;
    }
    if (!/^[\d\s.,:-]+$/.test(raw)) {
      setError("Geçerli sayı girin.");
      return;
    }
    const parsed = tryParseNumber(raw);
    if (!Number.isFinite(parsed)) {
      setError("Geçerli sayı girin.");
      return;
    }
    const normalized = String(parsed);
    props.onCommit(normalized);
    setText(normalized);
    setError("");
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
        onEndEditing={commit}
        onSubmitEditing={commit}
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
  headerLogo: {
    width: 34,
    height: 34,
    borderRadius: 8
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
  authLogo: {
    width: 86,
    height: 86,
    alignSelf: "center",
    marginBottom: 2
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
  portalHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#14532d",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#052e2b"
  },
  portalAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: "#2dd4bf",
    backgroundColor: "#0b1220"
  },
  portalAvatarFallback: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: "#2dd4bf",
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center"
  },
  portalAvatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900"
  },
  portalHeroText: {
    flex: 1,
    gap: 3
  },
  portalName: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "900"
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  kpiTile: {
    flex: 1,
    minWidth: 145,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#111827"
  },
  kpiValue: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "900"
  },
  kpiLabel: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700"
  },
  notificationItem: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    padding: 9,
    gap: 4,
    backgroundColor: "#111827"
  },
  notificationUnread: {
    borderColor: "#0f766e",
    backgroundColor: "#0b3f3a"
  },
  notificationTitle: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "800"
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
  evidencePreview: {
    width: "100%",
    height: 150,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#111827"
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
  twoColumnGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  gridField: {
    flex: 1,
    minWidth: 150
  },
  historyItem: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#0f172a"
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
  },
  languageSelector: {
    marginBottom: 20,
  },
  languageButton: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  languageButtonText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
  },
  languagePicker: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#334155",
    maxHeight: 200,
  },
  languageOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  languageOptionSelected: {
    backgroundColor: "#0f766e",
  },
  languageOptionText: {
    color: "#f8fafc",
    fontSize: 16,
  }
});
