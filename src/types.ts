export type SalaryMode = "NET" | "GROSS";

export type ShiftType = "NORMAL" | "OVERTIME" | "SUNDAY" | "HOLIDAY";

export type DayStatus = "WORKED" | "LEAVE" | "ANNUAL_LEAVE" | "REPORT" | "HOLIDAY_OFF";
export type DayType = "NORMAL" | "SUNDAY" | "UBGT";

export type LocationStamp = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
};

export type ActiveSession = {
  id: string;
  startAt: string;
  shiftType: ShiftType;
  note: string;
  checkInLocation: LocationStamp | null;
};

export type ShiftRecord = {
  id: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  shiftType: ShiftType;
  allowance: number;
  deduction: number;
  note: string;
  checkInLocation: LocationStamp | null;
  checkOutLocation: LocationStamp | null;
};

export type Coefficients = {
  overtime: number;
  sunday: number;
  holiday: number;
};

export type ThemePreference = "SYSTEM" | "LIGHT" | "DARK";
export type MealTransportAccrualMethod = "WORKED_ONLY" | "WORKED_AND_ANNUAL" | "PAYABLE_ALL";

export type PayrollSettings = {
  salaryMode: SalaryMode;
  monthlySalary: number;
  monthlyBaseHours: number;
  weeklyOvertimeThresholdHours: number;
  dailyOvertimeThresholdHours: number;
  coefficients: Coefficients;
  defaultShiftStart: string;
  defaultShiftEnd: string;
  defaultShiftHours: number;
  defaultOvertimeHours: number;
  monthlyMealAllowance: number;
  monthlyTransportAllowance: number;
  mealTransportAccrualMethod: MealTransportAccrualMethod;
  salaryPaymentDay: number;
  monthlyTarget: number;
  themePreference: ThemePreference;
};

export type CloudConfig = {
  enabled: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  employeeCode: string;
};

export type DayWorkMeta = {
  start: string;
  end: string;
  totalHours: number;
  breakMinutes: number;
  /** Legacy/display-only. Calculations use totalHours and thresholds unless manualOvertimeOverrideHours is set. */
  overtimeHours?: number;
  manualOvertimeOverrideHours?: number;
};

export type DayRecord = {
  dateKey: string;
  status: DayStatus | null;
  isManual: boolean;
  work: DayWorkMeta | null;
  note: string;
  updatedAt: string;
};

export type MonthPayment = {
  salary: number;
  overtime: number;
  sunday: number;
  ubgt: number;
  meal: number;
  transport: number;
};

export type TerminationType =
  | "EMPLOYER_TERMINATION"
  | "EMPLOYEE_RESIGNATION"
  | "JUST_CAUSE_EMPLOYEE"
  | "MUTUAL_AGREEMENT";

export type ResignationTemplateKey =
  | "STANDARD"
  | "NOTICE_WITH"
  | "NOTICE_WITHOUT"
  | "RETIREMENT"
  | "MARRIAGE"
  | "HEALTH"
  | "SALARY_UNPAID"
  | "OVERTIME_UNPAID"
  | "MOBBING"
  | "MILITARY"
  | "PROBATION"
  | "WORK_CONDITION_CHANGE"
  | "OHS_VIOLATION"
  | "SGK_PREMIUM_MISSING"
  | "ANNUAL_LEAVE_DENIED";

export type ResignationForm = {
  fullName: string;
  tcNo: string;
  workplaceTitle: string;
  department: string;
  phone: string;
  hireDate: string;
  leaveDate: string;
  letterDate: string;
  address: string;
  explanation: string;
  customDraft: string;
};

export type LegalSettings = {
  hireDate: string;
  terminationDate: string;
  grossSalary: number;
  mealAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  unusedAnnualLeaveDays: number;
  stampTaxRate: number;
  severanceCap: number;
  terminationType: TerminationType;
  terminationReason: string;
  resignationTemplate: ResignationTemplateKey;
  resignationForm: ResignationForm;
};

export type PersonalProfile = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  avatarUrl: string;
};

export type AppData = {
  settings: PayrollSettings;
  dayRecords: Record<string, DayRecord>;
  paidByMonth: Record<string, MonthPayment>;
  holidayDates: string[];
  halfHolidayDates: string[];
  closedMonths: Record<string, boolean>;
  cloud: CloudConfig;
  legal: LegalSettings;
  profile: PersonalProfile;
  // Legacy fields preserved for compatibility and migration
  shifts: ShiftRecord[];
  activeSession: ActiveSession | null;
};

export type MonthlySummary = {
  monthKey: string;
  salaryPeriodStart: string;
  salaryPeriodEndExclusive: string;
  salaryPeriodDisplayEnd: string;
  overtimePeriodStart: string;
  overtimePeriodEndExclusive: string;
  overtimePeriodDisplayEnd: string;
  salaryPeriodDays: number;
  overtimePeriodDays: number;
  payableDays: number;
  nonPayableDays: number;
  salaryRatioPercent: number;
  workedDays: number;
  leaveDays: number;
  annualLeaveDays: number;
  reportDays: number;
  holidayOffDays: number;
  normalWorkedDays: number;
  sundayWorkedDays: number;
  ubgtWorkedDays: number;
  totalHours: number;
  dailyOvertimeHours: number;
  weeklyOvertimeRawHours: number;
  weeklyAdditionalOvertimeHours: number;
  monthlyOvertimeRawHours: number;
  monthlyAdditionalOvertimeHours: number;
  weeklyOvertimeHours: number;
  monthlyOvertimeHours: number;
  overtimeHours: number;
  averageDailyOvertime: number;
  hourlyRate: number;
  salaryConfigured: boolean;
  baseSalary: number;
  reportDeduction: number;
  overtimePay: number;
  sundayPay: number;
  ubgtPay: number;
  monthlyMealAllowance: number;
  monthlyTransportAllowance: number;
  mealEntitledDays: number;
  transportEntitledDays: number;
  mealDailyRate: number;
  transportDailyRate: number;
  mealTotal: number;
  transportTotal: number;
  sideBenefitsTotal: number;
  expectedTotal: number;
  paid: MonthPayment;
  paidTotal: number;
  difference: number;
};

export type MonthlyAnalytics = {
  salaryPaymentDay: number;
  salaryWarning: string | null;
  monthlyTarget: number;
  targetProgressPercent: number;
  mostEarningDayKey: string | null;
  mostEarningDayAmount: number;
  mostWorkedWeekdayLabel: string | null;
  mostWorkedWeekdayCount: number;
  workRatePercent: number;
  reportRatePercent: number;
  leaveRatePercent: number;
};

export type MonthGridDay = {
  dateKey: string;
  inMonth: boolean;
};

export type LegalResult = {
  serviceDays: number;
  serviceYears: number;
  serviceMonths: number;
  serviceRemainDays: number;
  serviceText: string;
  annualLeaveEntitled: number;
  annualLeaveRemaining: number;
  annualLeavePay: number;
  severanceBase: number;
  severancePayGross: number;
  severanceStampTax: number;
  severancePayNet: number;
  noticeWeeks: number;
  noticePay: number;
  estimatedTotal: number;
};

export type UserRole = "USER" | "ADMIN";

export type AuthUser = {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
};
