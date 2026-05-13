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
  ubgt: number;
};

export type LanguageCode = "tr" | "th";

export type ThemePreference = "SYSTEM" | "LIGHT" | "DARK";
export type MealTransportAccrualMethod = "WORKED_ONLY" | "WORKED_AND_ANNUAL" | "PAYABLE_ALL";

export type PersonalGoals = {
  dailyHours: number;
  weeklyHours: number;
  monthlyHours: number;
  enableNotifications: boolean;
};

export type PomodoroSettings = {
  workDuration: number; // dakika
  breakDuration: number; // dakika
  longBreakDuration: number; // dakika
  sessionsUntilLongBreak: number;
};

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
  nightPremiumRate: number;
  mealTransportAccrualMethod: MealTransportAccrualMethod;
  salaryPaymentDay: number;
  monthlyTarget: number;
  themePreference: ThemePreference;
  language: LanguageCode;
  personalGoals: PersonalGoals;
  pomodoroSettings: PomodoroSettings;
  enableGamification: boolean;
  enableOfflineMode: boolean;
};

export type SalaryHistoryEntry = {
  id: string;
  startMonth: string;
  endMonth: string;
  monthlySalary: number;
  monthlyBaseHours: number;
  weeklyOvertimeThresholdHours: number;
  dailyOvertimeThresholdHours: number;
  monthlyMealAllowance: number;
  monthlyTransportAllowance: number;
  coefficients: Coefficients;
  note: string;
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

export type PaymentKind = "BANK" | "CASH" | "ADVANCE" | "ACCOUNTANT" | "OTHER_PERSON" | "OTHER";

export type PaymentTransaction = {
  id: string;
  monthKey: string;
  date: string;
  kind: PaymentKind;
  amount: number;
  description: string;
};

export type PayrollStatement = {
  id: string;
  monthKey: string;
  bordroNetSalary: number;
  bordroOvertime: number;
  bordroSunday: number;
  bordroUbgt: number;
  bordroMeal: number;
  bordroTransport: number;
  bankPaid: number;
  cashPaid: number;
  advanceDeduction: number;
  note: string;
};

export type ShiftTemplate = {
  id: string;
  name: string;
  start: string;
  end: string;
  breakMinutes: number;
  totalHours: number;
  manualOvertimeHours: number;
  note: string;
};

export type EvidenceFile = {
  id: string;
  monthKey: string;
  title: string;
  type: "BORDRO" | "DEKONT" | "WHATSAPP" | "VARDIYA" | "OTHER";
  uri: string;
  note: string;
  createdAt: string;
};

export type EmployeeRequestType = "LEAVE" | "ADVANCE" | "OVERTIME" | "EXPENSE" | "PROFILE" | "OTHER";
export type EmployeeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type EmployeeRequest = {
  id: string;
  type: EmployeeRequestType;
  status: EmployeeRequestStatus;
  title: string;
  startDate: string;
  endDate: string;
  amount: number;
  hours: number;
  note: string;
  managerNote: string;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeDocumentType = "IDENTITY" | "IBAN" | "HEALTH" | "CONTRACT" | "CERTIFICATE" | "OTHER";

export type EmployeeDocument = {
  id: string;
  title: string;
  type: EmployeeDocumentType;
  uri: string;
  note: string;
  createdAt: string;
};

export type EmployeeNotification = {
  id: string;
  title: string;
  message: string;
  tone: "INFO" | "SUCCESS" | "WARNING" | "DANGER";
  read: boolean;
  createdAt: string;
};

export type EmployeePortal = {
  iban: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  department: string;
  position: string;
  leaveBalanceDays: number;
  requests: EmployeeRequest[];
  documents: EmployeeDocument[];
  notifications: EmployeeNotification[];
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
  salaryHistory: SalaryHistoryEntry[];
  paymentTransactions: PaymentTransaction[];
  payrollStatements: PayrollStatement[];
  shiftTemplates: ShiftTemplate[];
  evidenceFiles: EvidenceFile[];
  dayRecords: Record<string, DayRecord>;
  paidByMonth: Record<string, MonthPayment>;
  holidayDates: string[];
  halfHolidayDates: string[];
  closedMonths: Record<string, boolean>;
  cloud: CloudConfig;
  legal: LegalSettings;
  profile: PersonalProfile;
  employeePortal: EmployeePortal;
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
  nightHours: number;
  nightPremiumPay: number;
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
  transactionPaidTotal: number;
  statementTotal: number;
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
