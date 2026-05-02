import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Device from "expo-device";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  useColorScheme,
  useWindowDimensions,
  View
} from "react-native";
import {
  buildResignationDraft,
  buildMonthGrid,
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
  DEFAULT_DATA,
  differenceColor,
  formatCurrency,
  formatDateKeyTr,
  formatSignedCurrency,
  isIsoDate,
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
  adminGetStats,
  adminGetUserDetail,
  adminGetUsers,
  adminRevokeUserSessions,
  adminUnbanUser,
  pingBackend,
  pullPayrollFromBackend,
  pushPayrollToBackend,
  remoteLogin,
  remoteLogout,
  remoteMe,
  remoteRegister,
  sendSecuritySignal
} from "./src/api";
import {
  AppData,
  AuthUser,
  DayRecord,
  DayStatus,
  LegalSettings,
  MonthPayment,
  TerminationType,
  ThemePreference
} from "./src/types";

type Tab = "CALENDAR" | "SUMMARY" | "SETTINGS" | "SYNC" | "LEGAL" | "USERS";
type PaymentField = keyof MonthPayment;
type NumericSettingKey =
  | "monthlySalary"
  | "monthlyBaseHours"
  | "defaultShiftHours"
  | "defaultOvertimeHours"
  | "dailyMealFee"
  | "dailyTransportFee"
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
    title: "İş Hukuku Bilgilendirme",
    content:
      "Puantaj, fazla mesai, hafta tatili ve UBGT hesapları iş sözleşmesi, toplu iş sözleşmesi ve güncel mevzuat birlikte değerlendirilerek yorumlanmalıdır. Uygulama hesapları yönlendirici niteliktedir; bağlayıcı bordro hükmü oluşturmaz."
  },
  {
    id: "kidem",
    title: "Kıdem Tazminatı Bilgisi",
    content:
      "Kıdem tazminatı hesabı, hizmet süresi, brüt ücret ve yasal tavan gibi değişkenlere bağlıdır. Uygulamadaki sonuç tahmin niteliğindedir. Nihai hesaplama için güncel tavan tutarı, sözleşme koşulları ve mevzuat hükümleri birlikte değerlendirilmelidir."
  },
  {
    id: "ihbar",
    title: "İhbar Tazminatı Bilgisi",
    content:
      "İhbar süresi, çalışma süresine göre değişir ve bildirim yükümlülüğüne uyulmaması halinde tazminat doğabilir. Hesaplama, brüt ücret ve yasal süreler üzerinden yapılır. Özel sözleşme hükümleri varsa ayrıca değerlendirilmelidir."
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

export default function App() {
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
  const [adminUsers, setAdminUsers] = useState<AdminPanelUser[]>([]);
  const [adminStats, setAdminStats] = useState<AdminPanelStats | null>(null);
  const [adminSelectedUser, setAdminSelectedUser] = useState<AdminPanelUserDetail | null>(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminBanReason, setAdminBanReason] = useState("Politika ihlali");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState("");

  const [activeTab, setActiveTab] = useState<Tab>("CALENDAR");
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [bulkStartDateKey, setBulkStartDateKey] = useState<string | null>(null);
  const [bulkEndDateKey, setBulkEndDateKey] = useState<string | null>(null);

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
  const deviceTheme = useColorScheme();
  const selectedTheme: ThemePreference = appData.settings.themePreference ?? "SYSTEM";
  const effectiveDarkMode = selectedTheme === "DARK" || (selectedTheme === "SYSTEM" && deviceTheme === "dark");

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
        let mergedData = localData;

        try {
          const remoteData = await pullPayrollFromBackend();
          if (remoteData) {
            mergedData = remoteData;
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
      setAppData(localData);
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
      appData.holidayDates
    );
  }, [appData.dayRecords, appData.holidayDates, appData.paidByMonth, appData.settings, monthKey]);

  useEffect(() => {
    setPaymentInputs(paidInputFromPayment(summary.paid));
  }, [monthKey, summary.paid]);

  const monthGrid = useMemo(() => buildMonthGrid(monthKey), [monthKey]);
  const totalDifference = useMemo(() => totalDifferenceForAllMonths(appData), [appData]);
  const legalResult = useMemo(() => calculateLegalResult(appData.legal), [appData.legal]);
  const analytics = useMemo(() => {
    return calculateMonthlyAnalytics(appData.dayRecords, appData.settings, monthKey, appData.holidayDates, summary);
  }, [appData.dayRecords, appData.holidayDates, appData.settings, monthKey, summary]);

  const isMonthClosed = !!appData.closedMonths[monthKey];

  const calendarPadding = 12;
  const contentWidth = Math.max(238, width - 24 - calendarPadding * 2);
  const dayCellWidth = Math.max(34, Math.floor(contentWidth / 7));
  const dayCellHeight = Math.max(50, Math.floor(dayCellWidth * 0.86));

  const selectedDayRecord = selectedDateKey ? normalizeDayRecord(appData.dayRecords[selectedDateKey]) : null;
  const selectedDayType = selectedDateKey ? dayTypeOf(selectedDateKey, appData.holidayDates) : "NORMAL";
  const selectedYearPrefix = `${monthKey.slice(0, 4)}-`;
  const visibleHolidayDates = appData.holidayDates.filter((item) => item.startsWith(selectedYearPrefix));
  const bulkRangeDateKeys =
    bulkStartDateKey && bulkEndDateKey ? dateRangeKeys(bulkStartDateKey, bulkEndDateKey) : bulkStartDateKey ? [bulkStartDateKey] : [];
  const bulkRangeSet = useMemo(() => new Set(bulkRangeDateKeys), [bulkRangeDateKeys]);

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
      `${bulkRangeDateKeys.length} g?ne '${nextStatusText}' durumu uygulanacak. Devam edilsin mi?`,
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

  const setThemePreference = (value: ThemePreference) => {
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        themePreference: value
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
    let merged = localData;

    if (source === "REMOTE") {
      try {
        const remoteData = await pullPayrollFromBackend();
        if (remoteData) {
          merged = remoteData;
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
          // Tercih edilen hata, ?evrimi?i giri?ten d?ner.
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
          // Tercih edilen hata, ?evrimi?i kay?ttan d?ner.
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
        const [stats, users] = await Promise.all([adminGetStats(), adminGetUsers(adminSearch)]);
        if (!mounted) {
          return;
        }
        setAdminStats(stats);
        setAdminUsers(users);
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

  const sharePdf = async (html: string, dialogTitle: string) => {
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("PDF hazır", uri);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle,
        UTI: "com.adobe.pdf"
      });
    } catch {
      Alert.alert("Hata", GENEL_HATA);
    }
  };

  const downloadMonthlyReport = async () => {
    if (!isMonthKey(monthKey)) {
      Alert.alert("Ay formatı hatalı", "Ay bilgisi YYYY-MM olmalı.");
      return;
    }

    try {
      const [yearStr, monthStr] = monthKey.split("-");
      const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
      const reportRows: string[] = [];

      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = `${monthKey}-${`${day}`.padStart(2, "0")}`;
        const record = appData.dayRecords[dateKey];
        if (!record || record.status === null) {
          continue;
        }
        const dayType = dayTypeOf(dateKey, appData.holidayDates);
        const workText =
          record.status === "WORKED"
            ? `${record.work?.start ?? appData.settings.defaultShiftStart}-${record.work?.end ?? appData.settings.defaultShiftEnd}`
            : "-";
        const totalHours = record.status === "WORKED" ? round2(record.work?.totalHours ?? appData.settings.defaultShiftHours) : 0;
        const overtimeHours =
          record.status === "WORKED" ? round2(record.work?.overtimeHours ?? appData.settings.defaultOvertimeHours) : 0;

        reportRows.push(
          [
            formatDateKeyTr(dateKey),
            dayTypeLabel(dayType),
            dayStatusLabel(record.status),
            workText,
            `${totalHours}`,
            `${overtimeHours}`
          ]
            .map(escapeCsvCell)
            .join(";")
        );
      }

      const header = [
        `Ay: ${monthLabelTr(monthKey)} (${monthKey})`,
        `Kullanıcı: ${authUser?.username ?? "-"}`,
        `Ödeme günü: ${analytics.salaryPaymentDay}`,
        "",
        `Çalışılan gün: ${summary.workedDays}`,
        `İzinli gün: ${summary.leaveDays}`,
        `Yıllık izin gün: ${summary.annualLeaveDays}`,
        `Raporlu gün: ${summary.reportDays}`,
        `Tatil gün: ${summary.holidayOffDays}`,
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
        "Tarih;Gün Tipi;Durum;Saat;Toplam Saat;Mesai Saat"
      ];

      const content = [...header, ...reportRows].join("\n");
      const html = [
        "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:18px;color:#0f172a;\">",
        "<h1>Puantaj ve Maa? ?zeti</h1>",
        "<pre style=\"white-space:pre-wrap;font-family:monospace;\">" + safeText(content) + "</pre>",
        "</body></html>"
      ].join("");
      await sharePdf(html, "Maa? PDF ?ndir");
    } catch {
      Alert.alert("Hata", GENEL_HATA);
    }
  };

  const downloadLegalTemplate = async (
    template: "NORMAL" | "HAKLI_FESIH" | "ASKERLIK" | "EVLILIK" | "MOBBING" | "MAAS_ODENMEMESI"
  ) => {
    const templateMap = {
      NORMAL: "STANDARD",
      HAKLI_FESIH: "NOTICE_WITHOUT",
      ASKERLIK: "MILITARY",
      EVLILIK: "MARRIAGE",
      MOBBING: "MOBBING",
      MAAS_ODENMEMESI: "SALARY_UNPAID"
    } as const;

    const draft = buildResignationDraft({
      template: templateMap[template],
      fullName: appData.legal.resignationForm.fullName || authUser?.username || "Ad Soyad",
      tcNo: appData.legal.resignationForm.tcNo,
      companyName: appData.legal.resignationForm.companyName || "?irket ?nvan?",
      department: appData.legal.resignationForm.department || "Departman",
      hireDate: appData.legal.resignationForm.hireDate || appData.legal.hireDate || "01.01.2025",
      leaveDate: appData.legal.resignationForm.leaveDate || appData.legal.terminationDate || "01.01.2026",
      letterDate: appData.legal.resignationForm.letterDate || new Date().toLocaleDateString("tr-TR"),
      address: appData.legal.resignationForm.address || "Adres",
      explanation: appData.legal.resignationForm.explanation
    });

    const html = [
      "<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body style=\"font-family:Arial,sans-serif;padding:20px;color:#0f172a;line-height:1.6;white-space:pre-wrap;\">",
      "<h1>?stifa Dilek?esi</h1>",
      safeText(draft),
      "</body></html>"
    ].join("");

    await sharePdf(html, "?stifa PDF ?ndir");
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
              <Pressable style={styles.legalChip} onPress={() => setLegalModalVisible(true)}>
                <Text style={styles.legalChipText}>KVKK, Gizlilik ve Yasal Metinleri Görüntüle</Text>
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
                placeholder="Örn: yusuf"
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
                returnKeyType={authMode === "USER_REGISTER" ? "next" : "go"}
                onSubmitEditing={() => {
                  if (authMode === "USER_REGISTER") {
                    inviteKeyInputRef.current?.focus();
                    return;
                  }
                  void handleLogin();
                }}
                blurOnSubmit={authMode !== "USER_REGISTER"}
              />

              {authMode === "USER_REGISTER" ? (
                <View style={styles.summaryCard}>
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
                    placeholder="Örn: 2026Avsar"
                    returnKeyType="done"
                    onSubmitEditing={() => void handleRegister()}
                  />

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

                  <Pressable onPress={() => setLegalModalVisible(true)}>
                    <Text style={styles.linkText}>Metinleri detaylı incele</Text>
                  </Pressable>
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
                  Bu uygulamadaki bilgiler yalnızca bilgilendirme amaçlıdır. Resmî hukuki danışmanlık yerine geçmez.
                </Text>
              </ScrollView>
              <Pressable style={styles.secondaryButton} onPress={() => setLegalModalVisible(false)}>
                <Text style={styles.secondaryButtonText}>Kapat</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

return (
    <SafeAreaView style={[styles.container, Platform.OS === "android" ? styles.androidTopInset : null]}>
      <ExpoStatusBar style={effectiveDarkMode ? "light" : "dark"} />

      <View style={styles.header}>
        <Text style={styles.title}>Puantaj Maaş Hesap</Text>
        <Text style={styles.subtitle}>Takvim üzerinden günlük kayıt ve aylık hesaplama</Text>
        <View style={styles.row}>
          <Text style={styles.helper}>{authUser.role === "ADMIN" ? "Yönetici" : "Kullanıcı"}: {authUser.username}</Text>
          <Pressable style={styles.deleteButton} onPress={handleLogout}>
            <Text style={styles.deleteButtonText}>Çıkış</Text>
          </Pressable>
        </View>
        <View style={styles.saveTextSlot}>
          <Text style={[styles.saveText, !saving ? styles.saveTextHidden : null]}>Kaydediliyor...</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TabButton label="Takvim" active={activeTab === "CALENDAR"} onPress={() => setActiveTab("CALENDAR")} />
        <TabButton label="Özet" active={activeTab === "SUMMARY"} onPress={() => setActiveTab("SUMMARY")} />
        <TabButton label="Ayarlar" active={activeTab === "SETTINGS"} onPress={() => setActiveTab("SETTINGS")} />
        <TabButton label="Senkronizasyon" active={activeTab === "SYNC"} onPress={() => setActiveTab("SYNC")} />
        <TabButton label="Hukuk" active={activeTab === "LEGAL"} onPress={() => setActiveTab("LEGAL")} />
        {authUser.role === "ADMIN" ? (
          <TabButton label="Kullanıcılar" active={activeTab === "USERS"} onPress={() => setActiveTab("USERS")} />
        ) : null}
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

            <View style={styles.calendarLegend}>
              <LegendItem color="#dcfce7" text="Normal" />
              <LegendItem color="#ede9fe" text="Pazar" />
              <LegendItem color="#fecaca" text="UBGT" />
              <LegendItem color="#fef9c3" text="Raporlu" />
              <LegendItem color="#dbeafe" text="İzinli" />
              <LegendItem color="#ffedd5" text="Yıllık" />
              <LegendItem color="#e5e7eb" text="Tatil" />
              <LegendItem color="#ffffff" text="Boş" />
            </View>

            {isMonthClosed ? <Text style={styles.closedBadge}>Bu ay kapalı, değişiklik yapılamaz.</Text> : null}

            <SummaryCard title="Toplu İşlem">
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
                    <Text style={styles.optionButtonText}>Hepsini Çalıştım</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("LEAVE")}>
                    <Text style={styles.optionButtonText}>Hepsini İzinli</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus("REPORT")}>
                    <Text style={styles.optionButtonText}>Hepsini Raporlu</Text>
                  </Pressable>
                  <Pressable style={styles.optionButton} onPress={() => applyBulkDayStatus(null)}>
                    <Text style={styles.optionButtonText}>Hepsini Temizle</Text>
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
                    const dayType = dayTypeOf(day.dateKey, appData.holidayDates);
                    const dayNumber = Number(day.dateKey.slice(-2));
                    const cardColor = dayStatusColor(record?.status ?? null, dayType, day.inMonth);
                    const isWorked = record?.status === "WORKED";
                    const isBulkSelected = bulkRangeSet.has(day.dateKey);

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
                            borderWidth: isBulkSelected ? 2 : 0.5,
                            borderColor: isBulkSelected ? "#0f766e" : "#d8dee9"
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
                          {dayType === "UBGT" ? "UBGT" : dayType === "SUNDAY" ? "Pazar" : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={styles.monthDiffBox}>
              <Text style={styles.infoLabel}>Bu ay fark:</Text>
              <Text style={[styles.monthDiffValue, { color: differenceColor(summary.difference) }]}>
                {formatSignedCurrency(summary.difference)} ({monthlyDifferenceLabel(summary.difference)})
              </Text>
            </View>
          </View>
        ) : null}

        {activeTab === "SUMMARY" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Aylık Özet</Text>
            <Text style={styles.helper}>{monthLabelTr(monthKey)}</Text>
            {analytics.salaryWarning ? <Text style={styles.error}>{analytics.salaryWarning}</Text> : null}

            <Pressable style={styles.secondaryButton} onPress={downloadMonthlyReport}>
              <Text style={styles.secondaryButtonText}>Aylık Rapor İndir</Text>
            </Pressable>

            <SummaryCard title="Günler">
              <InfoRow label="Çalışılan gün" value={`${summary.workedDays}`} />
              <InfoRow label="İzinli gün" value={`${summary.leaveDays}`} />
              <InfoRow label="Yıllık izin" value={`${summary.annualLeaveDays}`} />
              <InfoRow label="Raporlu gün" value={`${summary.reportDays}`} />
              <InfoRow label="Tatil gün" value={`${summary.holidayOffDays}`} />
            </SummaryCard>

            <SummaryCard title="Çalışma">
              <InfoRow label="Normal gün" value={`${summary.normalWorkedDays}`} />
              <InfoRow label="Pazar gün" value={`${summary.sundayWorkedDays}`} />
              <InfoRow label="UBGT gün" value={`${summary.ubgtWorkedDays}`} />
              <InfoRow label="Toplam çalışma saati" value={`${summary.totalHours} saat`} />
              <InfoRow label="Toplam mesai saati" value={`${summary.overtimeHours} saat`} />
              <InfoRow label="Günlük ortalama mesai" value={`${summary.averageDailyOvertime} saat`} />
            </SummaryCard>

            <SummaryCard title="Ücretler">
              <InfoRow label="Saatlik ücret" value={formatCurrency(summary.hourlyRate)} />
              <InfoRow label="Hak edilen maaş" value={formatCurrency(summary.baseSalary)} />
              <InfoRow label="Rapor kesinti" value={formatCurrency(summary.reportDeduction)} />
              <InfoRow label="Mesai ücreti" value={formatCurrency(summary.overtimePay)} />
              <InfoRow label="Pazar ücreti" value={formatCurrency(summary.sundayPay)} />
              <InfoRow label="UBGT ücreti" value={formatCurrency(summary.ubgtPay)} />
            </SummaryCard>

            <SummaryCard title="Yemek / Yol">
              <InfoRow label="Yemek toplam" value={formatCurrency(summary.mealTotal)} />
              <InfoRow label="Yol toplam" value={formatCurrency(summary.transportTotal)} />
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

              <InfoRow label="Hak edilen toplam" value={formatCurrency(summary.expectedTotal)} strong />
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

        {activeTab === "SETTINGS" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ayarlar</Text>

            <Text style={styles.label}>Bordro baz aylık ücret</Text>
            <TextInput
              value={String(appData.settings.monthlySalary)}
              onChangeText={(value) => setNumericSetting("monthlySalary", value)}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>Aylık baz saat</Text>
            <TextInput
              value={String(appData.settings.monthlyBaseHours)}
              onChangeText={(value) => setNumericSetting("monthlyBaseHours", value)}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>Mesai katsayısı</Text>
            <TextInput
              value={String(appData.settings.coefficients.overtime)}
              onChangeText={(value) => setCoefficient("overtime", value)}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>Pazar katsayısı</Text>
            <TextInput
              value={String(appData.settings.coefficients.sunday)}
              onChangeText={(value) => setCoefficient("sunday", value)}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>UBGT katsayısı</Text>
            <TextInput
              value={String(appData.settings.coefficients.holiday)}
              onChangeText={(value) => setCoefficient("holiday", value)}
              keyboardType="numeric"
              style={styles.input}
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
            <TextInput
              value={String(appData.settings.defaultShiftHours)}
              onChangeText={(value) => setNumericSetting("defaultShiftHours", value)}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>Varsayılan mesai saat</Text>
            <TextInput
              value={String(appData.settings.defaultOvertimeHours)}
              onChangeText={(value) => setNumericSetting("defaultOvertimeHours", value)}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>Günlük yemek ücreti</Text>
            <TextInput
              value={String(appData.settings.dailyMealFee)}
              onChangeText={(value) => setNumericSetting("dailyMealFee", value)}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>Günlük yol ücreti</Text>
            <TextInput
              value={String(appData.settings.dailyTransportFee)}
              onChangeText={(value) => setNumericSetting("dailyTransportFee", value)}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>Maaş ödeme günü</Text>
            <TextInput
              value={String(appData.settings.salaryPaymentDay)}
              onChangeText={(value) => setNumericSetting("salaryPaymentDay", value)}
              keyboardType="numeric"
              style={styles.input}
              placeholder="5"
            />

            <Text style={styles.label}>Aylık hedef kazanç</Text>
            <TextInput
              value={String(appData.settings.monthlyTarget)}
              onChangeText={(value) => setNumericSetting("monthlyTarget", value)}
              keyboardType="numeric"
              style={styles.input}
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
              Uygulama verileri g?venli ?ekilde e?itlenir. Teknik ayr?nt?lar kullan?c?ya g?sterilmez.
            </Text>

            <InfoRow label="Ba?lant? durumu" value={backendConnected ? "Ba?l?" : "K?smi / ?evrimd???"} />
            <Text style={styles.helper}>
              Ba?lant? ge?ici olarak kesilirse uygulama yerelde ?al??maya devam eder, ba?lant? yeniden kurulunca veriler
              otomatik e?itlenir.
            </Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={async () => {
                const ok = await pingBackend();
                setBackendConnected(ok);
                Alert.alert("Ba?lant? kontrol?", ok ? "Ba?lant? ba?ar?l?." : "??lem ger?ekle?tirilemedi, l?tfen tekrar deneyin.");
              }}
            >
              <Text style={styles.secondaryButtonText}>Ba?lant?y? Test Et</Text>
            </Pressable>
          </View>
        ) : null}

        {activeTab === "USERS" && authUser.role === "ADMIN" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Yönetim Paneli</Text>
            <Text style={styles.helper}>
              Admin işlemleri backend API üzerinden yapılır ve audit log tablosuna kaydedilir.
            </Text>
            {adminError ? <Text style={styles.error}>{adminError}</Text> : null}

            <View style={styles.row}>
              <Pressable
                style={[styles.secondaryButton, styles.flexInput]}
                onPress={async () => {
                  await refreshAdminStats();
                  await refreshAdminUsers();
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
                </Pressable>
              ))}
            </SummaryCard>

            {adminSelectedUser ? (
              <SummaryCard title={`Detay: ${adminSelectedUser.user.username}`}>
                <InfoRow label="IP" value={adminSelectedUser.user.lastIp ?? "-"} />
                <InfoRow label="Cihaz" value={adminSelectedUser.user.deviceInfo ?? "-"} />
                <InfoRow label="Ban sebebi" value={adminSelectedUser.user.banReason ?? "-"} />
                <InfoRow
                  label="Aktif oturum"
                  value={`${adminSelectedUser.sessions.filter((item) => !item.revokedAt).length}`}
                />
                <Text style={styles.label}>Yeni ban sebebi</Text>
                <TextInput
                  value={adminBanReason}
                  onChangeText={setAdminBanReason}
                  style={styles.input}
                  placeholder="Ban sebebini yaz"
                />

                <View style={styles.optionWrap}>
                  <Pressable
                    style={styles.optionButton}
                    onPress={() =>
                      runAdminAction(() => adminBanUser(adminSelectedUser.user.id, adminBanReason || "Admin tarafından banlandı."))
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

            <SummaryCard title="?stifa Dilek?esi ?rnekleri">
              <View style={styles.optionWrap}>
                <Pressable style={styles.optionButton} onPress={() => downloadLegalTemplate("NORMAL")}>
                  <Text style={styles.optionButtonText}>Normal</Text>
                </Pressable>
                <Pressable style={styles.optionButton} onPress={() => downloadLegalTemplate("HAKLI_FESIH")}>
                  <Text style={styles.optionButtonText}>Hakl? Fesih</Text>
                </Pressable>
                <Pressable style={styles.optionButton} onPress={() => downloadLegalTemplate("ASKERLIK")}>
                  <Text style={styles.optionButtonText}>Askerlik</Text>
                </Pressable>
                <Pressable style={styles.optionButton} onPress={() => downloadLegalTemplate("EVLILIK")}>
                  <Text style={styles.optionButtonText}>Evlilik</Text>
                </Pressable>
                <Pressable style={styles.optionButton} onPress={() => downloadLegalTemplate("MOBBING")}>
                  <Text style={styles.optionButtonText}>Mobbing</Text>
                </Pressable>
                <Pressable style={styles.optionButton} onPress={() => downloadLegalTemplate("MAAS_ODENMEMESI")}>
                  <Text style={styles.optionButtonText}>Maa? ?denmemesi</Text>
                </Pressable>
              </View>
            </SummaryCard>

            <SummaryCard title="Y?ll?k ?zin / ?hbar / K?dem Hesaplama">
              <Text style={styles.label}>??e giri? tarihi (01.01.2025)</Text>
              <TextInput
                value={appData.legal.hireDate}
                onChangeText={(value) => setLegalField("hireDate", value)}
                keyboardType="number-pad"
                style={styles.input}
              />

              <Text style={styles.label}>??ten ??k?? tarihi (01.01.2026)</Text>
              <TextInput
                value={appData.legal.terminationDate}
                onChangeText={(value) => setLegalField("terminationDate", value)}
                keyboardType="number-pad"
                style={styles.input}
              />

              <Text style={styles.label}>Br?t ?cret</Text>
              <TextInput
                value={String(appData.legal.grossSalary)}
                onChangeText={(value) => setLegalField("grossSalary", value)}
                keyboardType="numeric"
                style={styles.input}
              />

              <Text style={styles.label}>Kullan?lmayan y?ll?k izin g?n?</Text>
              <TextInput
                value={String(appData.legal.unusedAnnualLeaveDays)}
                onChangeText={(value) => setLegalField("unusedAnnualLeaveDays", value)}
                keyboardType="numeric"
                style={styles.input}
              />

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

            <SummaryCard title="Hesap Sonu?lar?">
              <InfoRow label="?al??ma s?resi" value={legalResult.serviceText} />
              <InfoRow label="Yakla??k k?dem tazminat?" value={formatCurrency(legalResult.severancePayNet)} />
              <InfoRow label="Yakla??k ihbar s?resi" value={`${legalResult.noticeWeeks} hafta`} />
              <InfoRow label="Yakla??k ihbar tazminat?" value={formatCurrency(legalResult.noticePay)} />
              <InfoRow label="Hak edilen y?ll?k izin" value={`${legalResult.annualLeaveEntitled} g?n`} />
              <InfoRow label="Kullan?lmayan izin" value={`${legalResult.annualLeaveRemaining} g?n`} />
              <InfoRow label="Kullan?lmayan y?ll?k izin ?creti" value={formatCurrency(legalResult.annualLeavePay)} />
              <InfoRow label="Tahmini toplam" value={formatCurrency(legalResult.estimatedTotal)} strong />
            </SummaryCard>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>AyfSoft - Tum Haklari Saklidir</Text>
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
                <Text style={styles.workInfoText}>Giriş: {selectedDayRecord.work?.start ?? appData.settings.defaultShiftStart}</Text>
                <Text style={styles.workInfoText}>Çıkış: {selectedDayRecord.work?.end ?? appData.settings.defaultShiftEnd}</Text>
                <Text style={styles.workInfoText}>
                  Toplam: {round2(selectedDayRecord.work?.totalHours ?? appData.settings.defaultShiftHours)} saat
                </Text>
                <Text style={styles.workInfoText}>
                  Mesai: {round2(selectedDayRecord.work?.overtimeHours ?? appData.settings.defaultOvertimeHours)} saat
                </Text>
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

function TabButton(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tabButton, props.active ? styles.tabButtonActive : null]} onPress={props.onPress}>
      <Text style={[styles.tabButtonText, props.active ? styles.tabButtonTextActive : null]}>{props.label}</Text>
    </Pressable>
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
    backgroundColor: "#f1f5f9"
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9"
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a"
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: "#475569"
  },
  saveText: {
    fontSize: 12,
    color: "#0f766e"
  },
  saveTextSlot: {
    marginTop: 4,
    minHeight: 16,
    justifyContent: "center"
  },
  saveTextHidden: {
    opacity: 0
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 6
  },
  tabButton: {
    backgroundColor: "#dbe2ec",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  tabButtonActive: {
    backgroundColor: "#0f766e"
  },
  tabButtonText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700"
  },
  tabButtonTextActive: {
    color: "#ffffff"
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
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9e2ec",
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
    borderColor: "#cbd5e1",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#f8fafc"
  },
  authModeButtonActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e"
  },
  authModeButtonText: {
    color: "#334155",
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
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9e2ec",
    padding: 12,
    gap: 10,
    overflow: "hidden"
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0f172a"
  },
  monthHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  monthHeaderCenter: {
    flex: 1,
    alignItems: "center"
  },
  monthTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0f172a"
  },
  monthRange: {
    marginTop: 2,
    fontSize: 13,
    color: "#475569"
  },
  navCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center"
  },
  navCircleText: {
    fontSize: 25,
    color: "#0f172a",
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
    borderColor: "#cbd5e1"
  },
  legendText: {
    fontSize: 11,
    color: "#334155",
    fontWeight: "600"
  },
  calendarCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    backgroundColor: "#ffffff",
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
    color: "#334155"
  },
  weekRow: {
    flexDirection: "row"
  },
  dayCell: {
    borderWidth: 0.5,
    borderColor: "#d8dee9",
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
    color: "#0f172a"
  },
  dayStatusShort: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827"
  },
  dayTime: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1f2937"
  },
  dayTag: {
    fontSize: 9,
    color: "#334155",
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
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#dbe4ee"
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
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#f8fafc"
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a"
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
    color: "#334155",
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
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f172a"
  },
  inputDisabled: {
    backgroundColor: "#f1f5f9",
    color: "#64748b"
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
    color: "#334155",
    flexShrink: 1
  },
  infoValue: {
    fontSize: 12,
    color: "#0f172a",
    textAlign: "right",
    flexShrink: 1
  },
  strong: {
    fontWeight: "800"
  },
  helper: {
    fontSize: 12,
    color: "#475569"
  },
  closedBadge: {
    fontSize: 12,
    color: "#7f1d1d",
    fontWeight: "800",
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  secondaryButton: {
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 13
  },
  deleteButton: {
    alignSelf: "flex-start",
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  deleteButtonText: {
    color: "#991b1b",
    fontWeight: "700",
    fontSize: 12
  },
  shiftText: {
    fontSize: 13,
    color: "#0f172a"
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
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#ffffff"
  },
  optionButtonActive: {
    borderColor: "#0f766e",
    backgroundColor: "#ccfbf1"
  },
  optionButtonText: {
    fontSize: 12,
    color: "#334155",
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
    backgroundColor: "#ffffff",
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
    color: "#334155",
    lineHeight: 18
  },
  footer: {
    paddingVertical: 8,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#dbe4ee",
    backgroundColor: "#f8fafc"
  },
  footerText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    gap: 10
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a"
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
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 8,
    gap: 4
  },
  workInfoText: {
    fontSize: 12,
    color: "#1e3a8a"
  },
  legalNote: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 18
  },
  legalSectionCard: {
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
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
    color: "#1f2937",
    lineHeight: 18
  },
  error: {
    fontSize: 12,
    color: "#b91c1c",
    fontWeight: "700"
  }
});


