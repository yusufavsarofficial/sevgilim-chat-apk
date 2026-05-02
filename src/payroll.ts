import {
  AppData,
  DayRecord,
  DayStatus,
  DayType,
  LegalResult,
  LegalSettings,
  MonthlyAnalytics,
  MonthGridDay,
  MonthPayment,
  MonthlySummary,
  PayrollSettings,
  ShiftRecord,
  ShiftType,
  TerminationType
} from "./types";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[0-1])$/;
const TR_DATE_REGEX = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.\d{4}$/;

const FIXED_HOLIDAY_MONTH_DAYS = ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"];

const WEEKDAY_LABELS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

const RESIGNATION_TEMPLATE_TEXTS = {
  STANDARD: "Kendi isteğimle işten ayrılmak istiyorum.",
  NOTICE_WITH: "İhbar süresine uyarak işten ayrılmak istiyorum.",
  NOTICE_WITHOUT: "Yasal haklarım saklı kalmak üzere ihbar süresiz ayrılış talep ediyorum.",
  RETIREMENT: "Emeklilik hakkı kazandığım için işten ayrılıyorum.",
  MARRIAGE: "Evlilik nedeniyle yasal süre içinde iş sözleşmemi feshediyorum.",
  HEALTH: "Sağlık nedenleriyle iş sözleşmemi feshediyorum.",
  SALARY_UNPAID: "Ücretlerim düzenli ödenmediği için haklı nedenle fesih bildiriyorum.",
  OVERTIME_UNPAID: "Fazla mesai ücretlerim ödenmediği için haklı nedenle fesih bildiriyorum.",
  MOBBING: "İşyerinde maruz kaldığım mobbing nedeniyle haklı nedenle fesih bildiriyorum.",
  MILITARY: "Askerlik görevi nedeniyle işten ayrılıyorum.",
  PROBATION: "Deneme süresi içinde işten ayrılıyorum.",
  WORK_CONDITION_CHANGE: "İş şartlarının esaslı değişikliği nedeniyle fesih bildiriyorum."
} as const;

export const DEFAULT_SETTINGS: PayrollSettings = {
  salaryMode: "NET",
  monthlySalary: 28075,
  monthlyBaseHours: 225,
  coefficients: {
    overtime: 1.5,
    sunday: 2.5,
    holiday: 2
  },
  defaultShiftStart: "20:00",
  defaultShiftEnd: "08:00",
  defaultShiftHours: 12,
  defaultOvertimeHours: 4.5,
  dailyMealFee: 0,
  dailyTransportFee: 0,
  salaryPaymentDay: 5,
  monthlyTarget: 0,
  themePreference: "SYSTEM"
};

export const DEFAULT_MONTH_PAYMENT: MonthPayment = {
  salary: 0,
  overtime: 0,
  sunday: 0,
  ubgt: 0,
  meal: 0,
  transport: 0
};

export const DEFAULT_DATA: AppData = {
  settings: DEFAULT_SETTINGS,
  dayRecords: {},
  paidByMonth: {},
  holidayDates: defaultHolidayDates(),
  closedMonths: {},
  cloud: {
    enabled: false,
    supabaseUrl: "",
    supabaseAnonKey: "",
    employeeCode: ""
  },
  legal: {
    hireDate: "",
    terminationDate: "",
    grossSalary: 0,
    mealAllowance: 0,
    transportAllowance: 0,
    otherAllowance: 0,
    unusedAnnualLeaveDays: 0,
    stampTaxRate: 0.759,
    severanceCap: 0,
    terminationType: "EMPLOYER_TERMINATION",
    terminationReason: "",
    resignationTemplate: "STANDARD",
    resignationForm: {
      fullName: "",
      tcNo: "",
      companyName: "",
      department: "",
      hireDate: "",
      leaveDate: "",
      letterDate: "",
      address: "",
      explanation: ""
    }
  },
  shifts: [],
  activeSession: null
};

export function defaultHolidayDates(): string[] {
  const today = new Date();
  const years = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];
  const dateSet = new Set<string>();

  for (const year of years) {
    for (const monthDay of FIXED_HOLIDAY_MONTH_DAYS) {
      dateSet.add(`${year}-${monthDay}`);
    }
  }

  return [...dateSet].sort();
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function safePositive(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

export function tryParseNumber(value: string): number {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function maskTrDateInput(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export function isTrDate(value: string): boolean {
  if (!TR_DATE_REGEX.test(value)) {
    return false;
  }
  return parseTrDate(value) !== null;
}

export function parseTrDate(value: string): Date | null {
  if (!TR_DATE_REGEX.test(value)) {
    return null;
  }
  const [dayStr, monthStr, yearStr] = value.split(".");
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function formatDateToTr(value: Date): string {
  const day = `${value.getDate()}`.padStart(2, "0");
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const year = value.getFullYear();
  return `${day}.${month}.${year}`;
}

export function formatCurrency(value: number): string {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${round2(value).toFixed(2)} TL`;
  }
}

export function formatSignedCurrency(value: number): string {
  const absText = formatCurrency(Math.abs(value));
  if (value > 0) {
    return `+${absText}`;
  }
  if (value < 0) {
    return `-${absText}`;
  }
  return `${formatCurrency(0)}`;
}

export function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export function currentMonthKey(): string {
  return toMonthKey(new Date());
}

export function prevMonthKey(monthKey: string): string {
  const date = monthKeyToDate(monthKey);
  if (!date) {
    return currentMonthKey();
  }
  date.setMonth(date.getMonth() - 1);
  return toMonthKey(date);
}

export function nextMonthKey(monthKey: string): string {
  const date = monthKeyToDate(monthKey);
  if (!date) {
    return currentMonthKey();
  }
  date.setMonth(date.getMonth() + 1);
  return toMonthKey(date);
}

export function isMonthKey(value: string): boolean {
  return MONTH_REGEX.test(value);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) {
    return false;
  }
  const date = dateKeyToDate(value);
  return !!date;
}

export function isSundayDate(dateKey: string): boolean {
  const date = dateKeyToDate(dateKey);
  if (!date) {
    return false;
  }
  return date.getDay() === 0;
}

export function formatDateKeyTr(dateKey: string): string {
  const date = dateKeyToDate(dateKey);
  if (!date) {
    return dateKey;
  }
  return formatDateToTr(date);
}

export function monthLabelTr(monthKey: string): string {
  const date = monthKeyToDate(monthKey);
  if (!date) {
    return monthKey;
  }
  const monthName = date.toLocaleDateString("tr-TR", { month: "long" });
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${date.getFullYear()}`;
}

export function monthKeyToDate(monthKey: string): Date | null {
  if (!isMonthKey(monthKey)) {
    return null;
  }
  const [yearStr, monthStr] = monthKey.split("-");
  return new Date(Number(yearStr), Number(monthStr) - 1, 1);
}

export function dateKeyToDate(dateKey: string): Date | null {
  if (!ISO_DATE_REGEX.test(dateKey)) {
    return null;
  }
  const [yearStr, monthStr, dayStr] = dateKey.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  if (
    date.getFullYear() !== Number(yearStr) ||
    date.getMonth() + 1 !== Number(monthStr) ||
    date.getDate() !== Number(dayStr)
  ) {
    return null;
  }
  return date;
}

export function dayTypeOf(dateKey: string, holidayDates: string[]): DayType {
  if (holidayDates.includes(dateKey)) {
    return "UBGT";
  }
  if (isSundayDate(dateKey)) {
    return "SUNDAY";
  }
  return "NORMAL";
}

export function dayTypeLabel(dayType: DayType): string {
  if (dayType === "UBGT") return "UBGT";
  if (dayType === "SUNDAY") return "Pazar";
  return "Normal";
}

export function dayStatusLabel(status: DayStatus | null): string {
  if (status === "WORKED") return "Çalıştım";
  if (status === "LEAVE") return "İzinli";
  if (status === "ANNUAL_LEAVE") return "Yıllık İzin";
  if (status === "REPORT") return "Raporlu";
  if (status === "HOLIDAY_OFF") return "Tatil";
  return "Boş";
}

export function dayStatusShort(status: DayStatus | null): string {
  if (status === "WORKED") return "Ç";
  if (status === "LEAVE") return "İ";
  if (status === "ANNUAL_LEAVE") return "Y";
  if (status === "REPORT") return "R";
  if (status === "HOLIDAY_OFF") return "T";
  return "";
}

export function dayStatusColor(status: DayStatus | null, dayType: DayType, inMonth: boolean): string {
  if (!inMonth) {
    return "#f3f4f6";
  }
  if (status === null) return "#ffffff";
  if (status === "LEAVE") return "#dbeafe";
  if (status === "ANNUAL_LEAVE") return "#ffedd5";
  if (status === "REPORT") return "#fef9c3";
  if (status === "HOLIDAY_OFF") return "#e5e7eb";
  if (status === "WORKED") {
    if (dayType === "UBGT") return "#fecaca";
    if (dayType === "SUNDAY") return "#ede9fe";
    return "#dcfce7";
  }
  return "#ffffff";
}

export function buildMonthGrid(monthKey: string): MonthGridDay[][] {
  const monthDate = monthKeyToDate(monthKey);
  if (!monthDate) {
    return [];
  }

  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const mondayIndex = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - mondayIndex);

  const weeks: MonthGridDay[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const row: MonthGridDay[] = [];
    for (let day = 0; day < 7; day += 1) {
      const current = new Date(start);
      current.setDate(start.getDate() + week * 7 + day);
      row.push({
        dateKey: toDateKey(current),
        inMonth: current.getMonth() === monthIndex
      });
    }
    weeks.push(row);
  }

  return weeks;
}

export function shiftMonthKey(shift: ShiftRecord): string {
  const date = new Date(shift.startAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return toMonthKey(date);
}

export function autoShiftType(requestedType: ShiftType, startAtIso: string, holidayDates: string[]): ShiftType {
  if (requestedType !== "NORMAL") {
    return requestedType;
  }
  const date = new Date(startAtIso);
  if (Number.isNaN(date.getTime())) {
    return requestedType;
  }
  const dayType = dayTypeOf(toDateKey(date), holidayDates);
  if (dayType === "UBGT") return "HOLIDAY";
  if (dayType === "SUNDAY") return "SUNDAY";
  return "NORMAL";
}

export function durationHours(shift: ShiftRecord): number {
  const start = new Date(shift.startAt);
  const end = new Date(shift.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  const rawHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const breakHours = safePositive(shift.breakMinutes) / 60;
  return round2(Math.max(0, rawHours - breakHours));
}

export function createWorkedRecord(dateKey: string, settings: PayrollSettings, isManual: boolean): DayRecord {
  return {
    dateKey,
    status: "WORKED",
    isManual,
    work: {
      start: settings.defaultShiftStart,
      end: settings.defaultShiftEnd,
      totalHours: safePositive(settings.defaultShiftHours),
      overtimeHours: safePositive(settings.defaultOvertimeHours)
    },
    note: "",
    updatedAt: new Date().toISOString()
  };
}

export function createStatusRecord(
  dateKey: string,
  status: Exclude<DayStatus, "WORKED">,
  isManual: boolean
): DayRecord {
  return {
    dateKey,
    status,
    isManual,
    work: null,
    note: "",
    updatedAt: new Date().toISOString()
  };
}

export function normalizeMonthPayment(value: unknown): MonthPayment {
  if (typeof value === "number") {
    return {
      ...DEFAULT_MONTH_PAYMENT,
      salary: safePositive(value)
    };
  }

  if (!value || typeof value !== "object") {
    return { ...DEFAULT_MONTH_PAYMENT };
  }

  const source = value as Partial<MonthPayment>;
  return {
    salary: safePositive(source.salary ?? 0),
    overtime: safePositive(source.overtime ?? 0),
    sunday: safePositive(source.sunday ?? 0),
    ubgt: safePositive(source.ubgt ?? 0),
    meal: safePositive(source.meal ?? 0),
    transport: safePositive(source.transport ?? 0)
  };
}

export function calculateMonthlySummary(
  dayRecords: Record<string, DayRecord>,
  settings: PayrollSettings,
  paidByMonth: Record<string, MonthPayment>,
  monthKey: string,
  holidayDates: string[]
): MonthlySummary {
  const monthDate = monthKeyToDate(monthKey);
  if (!monthDate) {
    const paid = normalizeMonthPayment(paidByMonth[monthKey]);
    const paidTotal = paid.salary + paid.overtime + paid.sunday + paid.ubgt + paid.meal + paid.transport;
    return {
      monthKey,
      workedDays: 0,
      leaveDays: 0,
      annualLeaveDays: 0,
      reportDays: 0,
      holidayOffDays: 0,
      normalWorkedDays: 0,
      sundayWorkedDays: 0,
      ubgtWorkedDays: 0,
      totalHours: 0,
      overtimeHours: 0,
      averageDailyOvertime: 0,
      hourlyRate: 0,
      salaryConfigured: false,
      baseSalary: 0,
      reportDeduction: 0,
      overtimePay: 0,
      sundayPay: 0,
      ubgtPay: 0,
      mealTotal: 0,
      transportTotal: 0,
      sideBenefitsTotal: 0,
      expectedTotal: 0,
      paid,
      paidTotal: round2(paidTotal),
      difference: round2(paidTotal)
    };
  }

  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  let workedDays = 0;
  let leaveDays = 0;
  let annualLeaveDays = 0;
  let reportDays = 0;
  let holidayOffDays = 0;
  let normalWorkedDays = 0;
  let sundayWorkedDays = 0;
  let ubgtWorkedDays = 0;

  let totalHours = 0;
  let overtimeHours = 0;
  let sundayHours = 0;
  let ubgtHours = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${`${day}`.padStart(2, "0")}`;
    const record = dayRecords[dateKey];

    if (!record || record.status === null) {
      continue;
    }

    if (record.status === "WORKED") {
      workedDays += 1;
      const kind = dayTypeOf(dateKey, holidayDates);
      const workHours = safePositive(record.work?.totalHours ?? settings.defaultShiftHours);
      const workedOvertime = safePositive(record.work?.overtimeHours ?? settings.defaultOvertimeHours);
      totalHours += workHours;
      overtimeHours += workedOvertime;

      if (kind === "UBGT") {
        ubgtWorkedDays += 1;
        ubgtHours += workHours;
      } else if (kind === "SUNDAY") {
        sundayWorkedDays += 1;
        sundayHours += workHours;
      } else {
        normalWorkedDays += 1;
      }
      continue;
    }

    if (record.status === "LEAVE") {
      leaveDays += 1;
      continue;
    }

    if (record.status === "ANNUAL_LEAVE") {
      annualLeaveDays += 1;
      continue;
    }

    if (record.status === "REPORT") {
      reportDays += 1;
      continue;
    }

    holidayOffDays += 1;
  }

  const monthlySalary = safePositive(settings.monthlySalary);
  const monthlyBaseHours = safePositive(settings.monthlyBaseHours);
  const salaryConfigured = monthlySalary > 0 && monthlyBaseHours > 0;
  const hourlyRate = salaryConfigured ? monthlySalary / monthlyBaseHours : 0;
  const dailySalary = salaryConfigured ? monthlySalary / 30 : 0;
  const payableWorkedDays = Math.min(30, workedDays);
  const baseSalary = salaryConfigured ? payableWorkedDays * dailySalary : 0;
  const reportDeduction = salaryConfigured ? Math.max(0, monthlySalary - baseSalary) : 0;
  const overtimePay = salaryConfigured
    ? overtimeHours * hourlyRate * safePositive(settings.coefficients.overtime)
    : 0;
  const sundayPay = salaryConfigured ? sundayHours * hourlyRate * safePositive(settings.coefficients.sunday) : 0;
  const ubgtPay = salaryConfigured ? ubgtHours * hourlyRate * safePositive(settings.coefficients.holiday) : 0;
  const mealTotal = workedDays * safePositive(settings.dailyMealFee);
  const transportTotal = workedDays * safePositive(settings.dailyTransportFee);
  const sideBenefitsTotal = mealTotal + transportTotal;
  const averageDailyOvertime = workedDays > 0 ? overtimeHours / workedDays : 0;

  const expectedTotal = baseSalary + overtimePay + sundayPay + ubgtPay + sideBenefitsTotal;
  const paid = normalizeMonthPayment(paidByMonth[monthKey]);
  const paidTotal = paid.salary + paid.overtime + paid.sunday + paid.ubgt + paid.meal + paid.transport;
  const difference = paidTotal - expectedTotal;

  return {
    monthKey,
    workedDays,
    leaveDays,
    annualLeaveDays,
    reportDays,
    holidayOffDays,
    normalWorkedDays,
    sundayWorkedDays,
    ubgtWorkedDays,
    totalHours: round2(totalHours),
    overtimeHours: round2(overtimeHours),
    averageDailyOvertime: round2(averageDailyOvertime),
    hourlyRate: round2(hourlyRate),
    salaryConfigured,
    baseSalary: round2(baseSalary),
    reportDeduction: round2(reportDeduction),
    overtimePay: round2(overtimePay),
    sundayPay: round2(sundayPay),
    ubgtPay: round2(ubgtPay),
    mealTotal: round2(mealTotal),
    transportTotal: round2(transportTotal),
    sideBenefitsTotal: round2(sideBenefitsTotal),
    expectedTotal: round2(expectedTotal),
    paid: {
      salary: round2(paid.salary),
      overtime: round2(paid.overtime),
      sunday: round2(paid.sunday),
      ubgt: round2(paid.ubgt),
      meal: round2(paid.meal),
      transport: round2(paid.transport)
    },
    paidTotal: round2(paidTotal),
    difference: round2(difference)
  };
}

export function calculateMonthlyAnalytics(
  dayRecords: Record<string, DayRecord>,
  settings: PayrollSettings,
  monthKey: string,
  holidayDates: string[],
  summary: MonthlySummary
): MonthlyAnalytics {
  const monthDate = monthKeyToDate(monthKey);
  const salaryPaymentDay = Math.max(1, Math.min(31, Math.floor(safePositive(settings.salaryPaymentDay) || 1)));
  const monthlyTarget = safePositive(settings.monthlyTarget);

  if (!monthDate) {
    return {
      salaryPaymentDay,
      salaryWarning: null,
      monthlyTarget,
      targetProgressPercent: 0,
      mostEarningDayKey: null,
      mostEarningDayAmount: 0,
      mostWorkedWeekdayLabel: null,
      mostWorkedWeekdayCount: 0,
      workRatePercent: 0,
      reportRatePercent: 0,
      leaveRatePercent: 0
    };
  }

  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const weekdayWorkedCounts = [0, 0, 0, 0, 0, 0, 0];

  let mostEarningDayKey: string | null = null;
  let mostEarningDayAmount = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${`${day}`.padStart(2, "0")}`;
    const record = dayRecords[dateKey];

    if (!record || record.status !== "WORKED") {
      continue;
    }

    const date = dateKeyToDate(dateKey);
    if (date) {
      weekdayWorkedCounts[date.getDay()] += 1;
    }

    const workHours = safePositive(record.work?.totalHours ?? settings.defaultShiftHours);
    const overHours = safePositive(record.work?.overtimeHours ?? settings.defaultOvertimeHours);
    const dayType = dayTypeOf(dateKey, holidayDates);
    const hourlyRate = safePositive(summary.hourlyRate);
    const overtimePay = overHours * hourlyRate * safePositive(settings.coefficients.overtime);
    const sundayPay = dayType === "SUNDAY" ? workHours * hourlyRate * safePositive(settings.coefficients.sunday) : 0;
    const ubgtPay = dayType === "UBGT" ? workHours * hourlyRate * safePositive(settings.coefficients.holiday) : 0;
    const benefitPay = safePositive(settings.dailyMealFee) + safePositive(settings.dailyTransportFee);
    const dayTotal = overtimePay + sundayPay + ubgtPay + benefitPay;

    if (dayTotal > mostEarningDayAmount) {
      mostEarningDayAmount = dayTotal;
      mostEarningDayKey = dateKey;
    }
  }

  let mostWorkedWeekdayLabel: string | null = null;
  let mostWorkedWeekdayCount = 0;
  for (let i = 0; i < weekdayWorkedCounts.length; i += 1) {
    if (weekdayWorkedCounts[i] > mostWorkedWeekdayCount) {
      mostWorkedWeekdayCount = weekdayWorkedCounts[i];
      mostWorkedWeekdayLabel = WEEKDAY_LABELS[i];
    }
  }

  let salaryWarning: string | null = null;
  if (!summary.salaryConfigured) {
    salaryWarning = "Bu ay maaş veya baz saat bilgisi eksik.";
  } else {
    const now = new Date();
    const nowMonthKey = toMonthKey(now);
    const isPastMonth = monthKey < nowMonthKey;
    const isCurrentMonthAfterPaymentDay = monthKey === nowMonthKey && now.getDate() >= salaryPaymentDay;
    if ((isPastMonth || isCurrentMonthAfterPaymentDay) && summary.paid.salary <= 0) {
      salaryWarning = `Bu ay için maaş girişi yapılmadı (ödeme günü: ${salaryPaymentDay}).`;
    }
  }

  return {
    salaryPaymentDay,
    salaryWarning,
    monthlyTarget,
    targetProgressPercent: monthlyTarget > 0 ? round2((summary.expectedTotal / monthlyTarget) * 100) : 0,
    mostEarningDayKey,
    mostEarningDayAmount: round2(mostEarningDayAmount),
    mostWorkedWeekdayLabel,
    mostWorkedWeekdayCount,
    workRatePercent: daysInMonth > 0 ? round2((summary.workedDays / daysInMonth) * 100) : 0,
    reportRatePercent: daysInMonth > 0 ? round2((summary.reportDays / daysInMonth) * 100) : 0,
    leaveRatePercent:
      daysInMonth > 0 ? round2(((summary.leaveDays + summary.annualLeaveDays) / daysInMonth) * 100) : 0
  };
}

export function monthlyDifferenceLabel(value: number): "EKSIK" | "FAZLA" | "ESIT" {
  if (value < 0) return "EKSIK";
  if (value > 0) return "FAZLA";
  return "ESIT";
}

export function differenceColor(value: number): string {
  if (value < 0) return "#b91c1c";
  if (value > 0) return "#15803d";
  return "#475569";
}

export function allMonthKeys(data: AppData): string[] {
  const months = new Set<string>();
  for (const dateKey of Object.keys(data.dayRecords)) {
    months.add(dateKey.slice(0, 7));
  }
  for (const monthKey of Object.keys(data.paidByMonth)) {
    months.add(monthKey);
  }
  for (const monthKey of Object.keys(data.closedMonths)) {
    months.add(monthKey);
  }
  months.add(currentMonthKey());
  return [...months].filter(isMonthKey).sort();
}

export function totalDifferenceForAllMonths(data: AppData): number {
  const months = allMonthKeys(data);
  let total = 0;
  for (const monthKey of months) {
    const summary = calculateMonthlySummary(
      data.dayRecords,
      data.settings,
      data.paidByMonth,
      monthKey,
      data.holidayDates
    );
    total += summary.difference;
  }
  return round2(total);
}

function calculateServiceParts(start: Date, end: Date): { years: number; months: number; days: number; totalDays: number } {
  const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  if (endDate < startDate) {
    return { years: 0, months: 0, days: 0, totalDays: 0 };
  }

  let years = endDate.getFullYear() - startDate.getFullYear();
  let months = endDate.getMonth() - startDate.getMonth();
  let days = endDate.getDate() - startDate.getDate();

  if (days < 0) {
    months -= 1;
    const previousMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 0).getDate();
    days += previousMonth;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  return {
    years: Math.max(0, years),
    months: Math.max(0, months),
    days: Math.max(0, days),
    totalDays: Math.max(0, totalDays)
  };
}

function noticeWeeksFromServiceDays(serviceDays: number): number {
  if (serviceDays < 180) {
    return 2;
  }
  if (serviceDays < 540) {
    return 4;
  }
  if (serviceDays < 1080) {
    return 6;
  }
  return 8;
}

export function terminationTypeLabel(type: TerminationType): string {
  if (type === "EMPLOYER_TERMINATION") return "İşveren feshi";
  if (type === "EMPLOYEE_RESIGNATION") return "İstifa";
  if (type === "JUST_CAUSE_EMPLOYEE") return "İşçi haklı feshi";
  return "Karşılıklı anlaşma";
}

export function calculateLegalResult(legal: LegalSettings): LegalResult {
  const grossSalary = safePositive(legal.grossSalary);
  const hireDate = parseTrDate(legal.hireDate);
  const rawEndDate = legal.terminationDate ? parseTrDate(legal.terminationDate) : new Date();
  const endDate = rawEndDate ?? new Date();

  if (!hireDate || !rawEndDate || endDate.getTime() < hireDate.getTime() || grossSalary <= 0) {
    return {
      serviceDays: 0,
      serviceYears: 0,
      serviceMonths: 0,
      serviceRemainDays: 0,
      serviceText: "0 yıl 0 ay 0 gün",
      annualLeaveEntitled: 0,
      annualLeaveRemaining: 0,
      annualLeavePay: 0,
      severanceBase: 0,
      severancePayGross: 0,
      severanceStampTax: 0,
      severancePayNet: 0,
      noticeWeeks: 0,
      noticePay: 0,
      estimatedTotal: 0
    };
  }

  const totalMonthlyGross =
    grossSalary +
    safePositive(legal.mealAllowance) +
    safePositive(legal.transportAllowance) +
    safePositive(legal.otherAllowance);

  const serviceParts = calculateServiceParts(hireDate, endDate);
  const serviceYearsFloat = serviceParts.totalDays / 365;

  let annualLeaveEntitled = 0;
  for (let year = 1; year <= Math.floor(serviceYearsFloat); year += 1) {
    if (year <= 5) {
      annualLeaveEntitled += 14;
    } else if (year < 15) {
      annualLeaveEntitled += 20;
    } else {
      annualLeaveEntitled += 26;
    }
  }

  const annualLeaveRemaining = safePositive(legal.unusedAnnualLeaveDays);
  const dailyGross = totalMonthlyGross / 30;
  const annualLeavePay = annualLeaveRemaining * dailyGross;

  const noticeWeeks = noticeWeeksFromServiceDays(serviceParts.totalDays);
  const noticePay = dailyGross * noticeWeeks * 7;

  const severanceMonthlyBase =
    safePositive(legal.severanceCap) > 0 ? Math.min(totalMonthlyGross, safePositive(legal.severanceCap)) : totalMonthlyGross;
  const severancePayGross = serviceYearsFloat >= 1 ? severanceMonthlyBase * serviceYearsFloat : 0;
  const severanceStampTax = severancePayGross * (safePositive(legal.stampTaxRate) / 100);
  const severancePayNet = Math.max(0, severancePayGross - severanceStampTax);

  const estimatedTotal = severancePayNet + noticePay + annualLeavePay;

  return {
    serviceDays: serviceParts.totalDays,
    serviceYears: serviceParts.years,
    serviceMonths: serviceParts.months,
    serviceRemainDays: serviceParts.days,
    serviceText: `${serviceParts.years} yıl ${serviceParts.months} ay ${serviceParts.days} gün`,
    annualLeaveEntitled,
    annualLeaveRemaining: round2(annualLeaveRemaining),
    annualLeavePay: round2(annualLeavePay),
    severanceBase: round2(severanceMonthlyBase),
    severancePayGross: round2(severancePayGross),
    severanceStampTax: round2(severanceStampTax),
    severancePayNet: round2(severancePayNet),
    noticeWeeks,
    noticePay: round2(noticePay),
    estimatedTotal: round2(estimatedTotal)
  };
}

export function resignationTemplateText(key: keyof typeof RESIGNATION_TEMPLATE_TEXTS): string {
  return RESIGNATION_TEMPLATE_TEXTS[key];
}

export function buildResignationDraft(input: {
  template: keyof typeof RESIGNATION_TEMPLATE_TEXTS;
  fullName: string;
  tcNo: string;
  companyName: string;
  department: string;
  hireDate: string;
  leaveDate: string;
  letterDate: string;
  address: string;
  explanation: string;
}): string {
  const reason = input.explanation.trim() || resignationTemplateText(input.template);
  return [
    "İSTİFA DİLEKÇESİ",
    "",
    `Tarih: ${input.letterDate || "..../..../........"}`,
    `İşveren: ${input.companyName || "............................"}`,
    `Departman: ${input.department || "............................"}`,
    `Adres: ${input.address || "............................"}`,
    "",
    `İşe Giriş Tarihi: ${input.hireDate || "..../..../........"}`,
    `Ayrılış Tarihi: ${input.leaveDate || "..../..../........"}`,
    "",
    "Açıklama:",
    reason,
    "",
    "Bilgilerinize sunarım.",
    "",
    `Ad Soyad: ${input.fullName || "............................"}`,
    `T.C. Kimlik No: ${input.tcNo || "............................"}`,
    "İmza:"
  ].join("\n");
}
