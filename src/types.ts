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

export type PayrollSettings = {
  salaryMode: SalaryMode;
  monthlySalary: number;
  monthlyBaseHours: number;
  coefficients: Coefficients;
  defaultShiftStart: string;
  defaultShiftEnd: string;
  defaultShiftHours: number;
  defaultOvertimeHours: number;
  dailyMealFee: number;
  dailyTransportFee: number;
  salaryPaymentDay: number;
  monthlyTarget: number;
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
  overtimeHours: number;
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

export type LegalSettings = {
  hireDate: string;
  terminationDate: string;
  grossSalary: number;
  unusedAnnualLeaveDays: number;
  terminationType: TerminationType;
};

export type AppData = {
  settings: PayrollSettings;
  dayRecords: Record<string, DayRecord>;
  paidByMonth: Record<string, MonthPayment>;
  holidayDates: string[];
  closedMonths: Record<string, boolean>;
  cloud: CloudConfig;
  legal: LegalSettings;
  // Legacy fields preserved for compatibility and migration
  shifts: ShiftRecord[];
  activeSession: ActiveSession | null;
};

export type MonthlySummary = {
  monthKey: string;
  workedDays: number;
  leaveDays: number;
  annualLeaveDays: number;
  reportDays: number;
  holidayOffDays: number;
  normalWorkedDays: number;
  sundayWorkedDays: number;
  ubgtWorkedDays: number;
  totalHours: number;
  overtimeHours: number;
  averageDailyOvertime: number;
  hourlyRate: number;
  salaryConfigured: boolean;
  baseSalary: number;
  reportDeduction: number;
  overtimePay: number;
  sundayPay: number;
  ubgtPay: number;
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
  annualLeaveEntitled: number;
  annualLeaveRemaining: number;
  annualLeavePay: number;
  severancePay: number;
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

