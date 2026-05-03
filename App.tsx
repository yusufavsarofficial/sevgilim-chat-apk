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

const WEEK_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
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
      Alert.alert("Ay formatı hatalı", "Ay bilgisi YYYY-MM olmalı.");
      return;
    }
    if (isMonthClosed) {
      Alert.alert("Ay kapalı", "Bu ay kapalı olduğu için ödeme değiştirilemez.");
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
      setAuthError("Kullanıcı adı ve şifre zorunludur.");
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
          // Tercih edilen hata, çevrimiçi girişten döner.
        }
      }
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

    if (!allRequiredConsentsAccepted) {
      setAuthError("Zorunlu onaylar tamamlanmadan kayıt yapılamaz.");
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
          // Tercih edilen hata, çevrimiçi kayıttan döner.
        }
      }
      setAuthError(sanitizeUserMessage(error, "Kayıt işlemi tamamlanamadı."));
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
    setAdminIpReason("Güvenlik ihlali");
    setAdminBanDurationHours("");
    setDrawerVisible(false);
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
          ? `${record.work?.start ?? appData.settings.defaultShiftStart}-${record.work?.end ?? appData.settings.defaultShiftEnd}`
          : "-";
      const totalHours =
        record.status === "WORKED" ? `${round2(record.work?.totalHours ?? appData.settings.defaultShiftHours)}` : "0";
      const workHours = record.work?.totalHours ?? appData.settings.defaultShiftHours;
      const overtimeHours =
        record.status === "WORKED"
          ? `${calculateDailyOvertimeHours(workHours, appData.settings, record.work?.manualOvertimeOverrideHours)}`
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
                            ? shortShiftLabel(record?.work?.start ?? appData.settings.defaultShiftStart, record?.work?.end ?? appData.settings.defaultShiftEnd)
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
              <Pressable style={styles.secondaryButton} onPress={downloadSalarySummaryPdf}>
                <Text style={styles.secondaryButtonText}>Maaş Özeti PDF</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={downloadPuantajSummaryPdf}>
                <Text style={styles.secondaryButtonText}>Puantaj Özeti PDF</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={downloadDailyDetailPdf}>
                <Text style={styles.secondaryButtonText}>Gün Gün Detay PDF</Text>
              </Pressable>
            </View>

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
              <InfoRow label="Fazla mesai katsayısı" value={`${appData.settings.coefficients.overtime}`} />
              <InfoRow label="Maaş hak edişi" value={formatCurrency(summary.baseSalary)} />
              <InfoRow label="Dönem kesintisi" value={formatCurrency(summary.reportDeduction)} />
              <InfoRow label="Mesai hak edişi" value={formatCurrency(summary.overtimePay)} />
              <InfoRow label="Pazar hak edişi" value={formatCurrency(summary.sundayPay)} />
              <InfoRow label="UBGT hak edişi" value={formatCurrency(summary.ubgtPay)} />
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
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>Yatırılan mesai</Text>
              <TextInput
                value={paymentInputs.overtime}
                onChangeText={(value) => updateMonthPaymentInput("overtime", value)}
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>Yatırılan pazar</Text>
              <TextInput
                value={paymentInputs.sunday}
                onChangeText={(value) => updateMonthPaymentInput("sunday", value)}
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>Yatırılan UBGT</Text>
              <TextInput
                value={paymentInputs.ubgt}
                onChangeText={(value) => updateMonthPaymentInput("ubgt", value)}
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>Yatırılan yemek</Text>
              <TextInput
                value={paymentInputs.meal}
                onChangeText={(value) => updateMonthPaymentInput("meal", value)}
                keyboardType="numeric"
                style={[styles.input, isMonthClosed ? styles.inputDisabled : null]}
                editable={!isMonthClosed}
              />

              <Text style={styles.label}>Yatırılan yol</Text>
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
                <Text style={styles.secondaryButtonText}>Ödemeyi Kaydet</Text>
              </Pressable>

              <InfoRow label="Toplam hak ediş" value={formatCurrency(summary.expectedTotal)} strong />
              <InfoRow label="Yatırılan toplam" value={formatCurrency(summary.paidTotal)} strong />
              <InfoRow
                label="Fark"
                value={`${formatSignedCurrency(summary.difference)} (${monthlyDifferenceLabel(summary.difference)})`}
                strong
                valueColor={differenceColor(summary.difference)}
              />
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

        {activeTab === "SETTINGS" && authUser.role === "ADMIN" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Özel Ayarlar</Text>

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
              value={appData.settings.coefficients.holiday}
              onCommit={(value) => setCoefficient("holiday", value)}
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

            {authUser.role === "ADMIN" ? (
              <>
                <Pressable style={styles.drawerItem} onPress={() => selectDrawerTab("SETTINGS")}>
                  <Text style={styles.drawerItemText}>Özel Ayarlar</Text>
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
    const normalized = text.trim().replace(",", ".");
    if (!normalized) {
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(normalized)) {
      setError("Geçerli sayı girin.");
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


