export type PayrollEngineSettings = {
  monthlyNetSalary?: number;
  normalMonthlyHours?: number;
  weeklyLegalHours?: number;
  overtimeMultiplier?: number;
  sundayMultiplier?: number;
  ubgtMultiplier?: number;
  nightPremiumRate?: number;
  deductBreak?: boolean;
  defaultBreakMinutes?: number;
  includeMealRoadOnSundayHoliday?: boolean;
  mealAmount?: number;
  roadAmount?: number;
};

export type PayrollEntry = {
  date: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  isSunday?: boolean;
  isOfficialHoliday?: boolean;
  note?: string;
};

export type PayrollDayResult = {
  date: string;
  totalHours: number;
  normalHours: number;
  overtimeHours: number;
  sundayHours: number;
  ubgtHours: number;
  nightHours: number;
  note: string;
};

export type PayrollCalculationResult = {
  days: PayrollDayResult[];
  totalHours: number;
  normalHours: number;
  overtimeHours: number;
  sundayHours: number;
  ubgtHours: number;
  nightHours: number;
  normalPay: number;
  overtimePay: number;
  sundayPay: number;
  ubgtPay: number;
  nightPremiumPay: number;
  mealRoadPay: number;
  totalEarned: number;
  normalCalismaSaati: number;
  toplamFiiliSaat: number;
  fazlaMesaiSaati: number;
  pazarCalismaSaati: number;
  resmiTatilSaati: number;
  geceCalismaSaati: number;
  saatlikUcret: number;
  normalUcret: number;
  fazlaMesaiUcreti: number;
  pazarUcreti: number;
  resmiTatilUcreti: number;
  gecePrimi: number;
  yemekUcreti: number;
  yolUcreti: number;
  toplamHakEdis: number;
  toplamYatirilan: number;
  eksikAlacak: number;
  detayliAciklama: string;
};

const DEFAULT_ENGINE_SETTINGS: Required<PayrollEngineSettings> = {
  monthlyNetSalary: 0,
  normalMonthlyHours: 225,
  weeklyLegalHours: 45,
  overtimeMultiplier: 1.5,
  sundayMultiplier: 1.5,
  ubgtMultiplier: 1,
  nightPremiumRate: 0.25,
  deductBreak: false,
  defaultBreakMinutes: 0,
  includeMealRoadOnSundayHoliday: false,
  mealAmount: 0,
  roadAmount: 0
};

export function parsePayrollNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return 0;
  }

  const compact = raw.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const separator = lastComma > lastDot ? "," : lastDot >= 0 ? "." : "";
  let normalized = compact;
  if (separator) {
    const otherSeparator = separator === "," ? "." : ",";
    const parts = compact.split(separator);
    const decimalPart = parts[parts.length - 1] ?? "";
    const groups = compact.replace(/^-/, "").split(separator);
    const looksLikeThousandsOnly =
      !compact.includes(otherSeparator) &&
      decimalPart.length === 3 &&
      groups[0].length >= 1 &&
      groups[0].length <= 3 &&
      groups.slice(1).every((group) => group.length === 3);

    normalized = looksLikeThousandsOnly
      ? compact.replace(/[.,]/g, "")
      : `${parts.slice(0, -1).join(separator).replace(/[.,]/g, "")}.${decimalPart.replace(/[.,]/g, "")}`;
  } else {
    normalized = compact.replace(/[.,]/g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseClock(value: string | undefined): number | null {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23) {
    return null;
  }
  return hour + minute / 60;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateDurationHours(startTime: string | undefined, endTime: string | undefined): number {
  const start = parseClock(startTime);
  const end = parseClock(endTime);
  if (start === null || end === null) {
    return 0;
  }
  const normalizedEnd = end < start ? end + 24 : end;
  return Math.max(0, normalizedEnd - start);
}

function calculateNightHours(startTime: string | undefined, endTime: string | undefined): number {
  const start = parseClock(startTime);
  const end = parseClock(endTime);
  if (start === null || end === null) {
    return 0;
  }

  const normalizedEnd = end < start ? end + 24 : end;
  let night = 0;
  for (let cursor = start; cursor < normalizedEnd; cursor += 0.25) {
    const hour = cursor % 24;
    if (hour >= 20 || hour < 6) {
      night += Math.min(0.25, normalizedEnd - cursor);
    }
  }
  return round2(night);
}

function weekKey(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function calculatePayroll(
  entries: PayrollEntry[],
  settings: PayrollEngineSettings = {}
): PayrollCalculationResult {
  const config = { ...DEFAULT_ENGINE_SETTINGS, ...settings };
  const hourlyRate =
    config.monthlyNetSalary > 0 && config.normalMonthlyHours > 0
      ? config.monthlyNetSalary / config.normalMonthlyHours
      : 0;

  const days = entries.map<PayrollDayResult>((entry) => {
    const rawHours = calculateDurationHours(entry.startTime, entry.endTime);
    const breakMinutes = config.deductBreak
      ? parsePayrollNumber(entry.breakMinutes ?? config.defaultBreakMinutes)
      : 0;
    const totalHours = round2(Math.max(0, rawHours - breakMinutes / 60));
    const sundayHours = entry.isSunday ? totalHours : 0;
    const ubgtHours = entry.isOfficialHoliday ? totalHours : 0;
    return {
      date: entry.date,
      totalHours,
      normalHours: entry.isSunday || entry.isOfficialHoliday ? 0 : totalHours,
      overtimeHours: 0,
      sundayHours,
      ubgtHours,
      nightHours: calculateNightHours(entry.startTime, entry.endTime),
      note: entry.note ?? ""
    };
  });

  const weeklyTotals = new Map<string, number>();
  for (const day of days) {
    weeklyTotals.set(weekKey(day.date), (weeklyTotals.get(weekKey(day.date)) ?? 0) + day.totalHours);
  }

  const weeklyOvertimeByWeek = new Map<string, number>();
  for (const [key, hours] of weeklyTotals.entries()) {
    weeklyOvertimeByWeek.set(key, Math.max(0, hours - config.weeklyLegalHours));
  }

  for (const day of days) {
    const key = weekKey(day.date);
    const remainingWeekOvertime = weeklyOvertimeByWeek.get(key) ?? 0;
    const dayOvertime = Math.min(day.normalHours, remainingWeekOvertime);
    day.overtimeHours = round2(dayOvertime);
    day.normalHours = round2(Math.max(0, day.normalHours - dayOvertime));
    weeklyOvertimeByWeek.set(key, Math.max(0, remainingWeekOvertime - dayOvertime));
  }

  const totalHours = round2(days.reduce((sum, day) => sum + day.totalHours, 0));
  const normalHours = round2(days.reduce((sum, day) => sum + day.normalHours, 0));
  const overtimeHours = round2(days.reduce((sum, day) => sum + day.overtimeHours, 0));
  const sundayHours = round2(days.reduce((sum, day) => sum + day.sundayHours, 0));
  const ubgtHours = round2(days.reduce((sum, day) => sum + day.ubgtHours, 0));
  const nightHours = round2(days.reduce((sum, day) => sum + day.nightHours, 0));
  const mealRoadEligibleDays = days.filter(
    (day) => config.includeMealRoadOnSundayHoliday || (day.sundayHours === 0 && day.ubgtHours === 0)
  ).length;

  const normalPay = normalHours * hourlyRate;
  const overtimePay = overtimeHours * hourlyRate * config.overtimeMultiplier;
  const sundayPay = sundayHours * hourlyRate * config.sundayMultiplier;
  const ubgtPay = ubgtHours * hourlyRate * config.ubgtMultiplier;
  const nightPremiumPay = nightHours * hourlyRate * config.nightPremiumRate;
  const mealRoadPay = mealRoadEligibleDays * (config.mealAmount + config.roadAmount);

  const roundedNormalPay = round2(normalPay);
  const roundedOvertimePay = round2(overtimePay);
  const roundedSundayPay = round2(sundayPay);
  const roundedUbgtPay = round2(ubgtPay);
  const roundedNightPremiumPay = round2(nightPremiumPay);
  const totalMeal = round2(mealRoadEligibleDays * config.mealAmount);
  const totalRoad = round2(mealRoadEligibleDays * config.roadAmount);
  const roundedMealRoadPay = round2(mealRoadPay);
  const totalEarned = round2(normalPay + overtimePay + sundayPay + ubgtPay + nightPremiumPay + mealRoadPay);

  return {
    days,
    totalHours,
    normalHours,
    overtimeHours,
    sundayHours,
    ubgtHours,
    nightHours,
    normalPay: roundedNormalPay,
    overtimePay: roundedOvertimePay,
    sundayPay: roundedSundayPay,
    ubgtPay: roundedUbgtPay,
    nightPremiumPay: roundedNightPremiumPay,
    mealRoadPay: roundedMealRoadPay,
    totalEarned,
    normalCalismaSaati: normalHours,
    toplamFiiliSaat: totalHours,
    fazlaMesaiSaati: overtimeHours,
    pazarCalismaSaati: sundayHours,
    resmiTatilSaati: ubgtHours,
    geceCalismaSaati: nightHours,
    saatlikUcret: round2(hourlyRate),
    normalUcret: roundedNormalPay,
    fazlaMesaiUcreti: roundedOvertimePay,
    pazarUcreti: roundedSundayPay,
    resmiTatilUcreti: roundedUbgtPay,
    gecePrimi: roundedNightPremiumPay,
    yemekUcreti: totalMeal,
    yolUcreti: totalRoad,
    toplamHakEdis: totalEarned,
    toplamYatirilan: 0,
    eksikAlacak: totalEarned,
    detayliAciklama:
      `Toplam ${totalHours} saat fiili çalışma, ${overtimeHours} saat fazla mesai, ` +
      `${sundayHours} saat Pazar, ${ubgtHours} saat UBGT ve ${nightHours} saat gece çalışması hesaplandı.`
  };
}
