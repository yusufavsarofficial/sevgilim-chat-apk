import assert from "node:assert/strict";
import {
  calculateMonthlySummary,
  DEFAULT_DATA,
  DEFAULT_SETTINGS,
  isMealTransportEligible,
  round2,
  tryParseNumber
} from "../src/payroll";
import { DayRecord, PayrollSettings } from "../src/types";

function worked(dateKey: string, totalHours: number): DayRecord {
  return {
    dateKey,
    status: "WORKED",
    isManual: true,
    work: {
      start: "08:00",
      end: "20:00",
      totalHours,
      breakMinutes: 0
    },
    note: "",
    updatedAt: "2026-05-01T00:00:00.000Z"
  };
}

function summary(records: Record<string, DayRecord>, settings: PayrollSettings = DEFAULT_SETTINGS) {
  return calculateMonthlySummary(records, settings, {}, "2026-05", DEFAULT_DATA.holidayDates, DEFAULT_DATA.halfHolidayDates);
}

const settings = {
  ...DEFAULT_SETTINGS,
  monthlySalary: 28075,
  monthlyBaseHours: 225,
  dailyOvertimeThresholdHours: 7.5,
  weeklyOvertimeThresholdHours: 45,
  coefficients: {
    ...DEFAULT_SETTINGS.coefficients,
    overtime: 1.5
  },
  monthlyMealAllowance: 3100,
  monthlyTransportAllowance: 3100
};

{
  const result = summary({ "2026-05-04": worked("2026-05-04", 12) }, settings);
  assert.equal(result.dailyOvertimeHours, 4.5);
  assert.equal(result.overtimeHours, 4.5);
  assert.equal(result.overtimePay, 842.25);
}

{
  const records: Record<string, DayRecord> = {};
  for (let day = 4; day <= 8; day += 1) {
    records[`2026-05-${String(day).padStart(2, "0")}`] = worked(`2026-05-${String(day).padStart(2, "0")}`, 12);
  }
  const result = summary(records, settings);
  assert.equal(result.totalHours, 60);
  assert.equal(result.dailyOvertimeHours, 22.5);
  assert.equal(result.weeklyOvertimeRawHours, 15);
  assert.equal(result.weeklyAdditionalOvertimeHours, 0);
  assert.equal(result.overtimeHours, 22.5);
  assert.equal(result.overtimePay, 4211.25);
}

{
  const records: Record<string, DayRecord> = {};
  const weekdays = [
    4, 5, 6, 7, 8,
    11, 12, 13, 14, 15,
    18, 19, 20, 21, 22,
    25, 26, 27, 28, 29
  ];
  for (const day of weekdays) {
    const key = `2026-05-${String(day).padStart(2, "0")}`;
    records[key] = worked(key, 12);
  }
  const result = summary(records, settings);
  assert.equal(result.dailyOvertimeHours, 90);
  assert.equal(result.weeklyAdditionalOvertimeHours, 0);
  assert.equal(result.monthlyAdditionalOvertimeHours, 0);
  assert.equal(result.overtimeHours, 90);
  assert.equal(result.overtimePay, 16845);
}

{
  const sunday = summary({ "2026-05-03": worked("2026-05-03", 12) }, settings);
  assert.equal(sunday.mealTotal, 0);
  assert.equal(sunday.transportTotal, 0);
}

{
  const ubgt = summary({ "2026-05-01": worked("2026-05-01", 12) }, settings);
  assert.equal(ubgt.mealTotal, 0);
  assert.equal(ubgt.transportTotal, 0);
}

{
  const normal = summary({ "2026-05-04": worked("2026-05-04", 12) }, settings);
  assert.equal(normal.mealTotal > 0, true);
  assert.equal(normal.transportTotal > 0, true);
  assert.equal(isMealTransportEligible("2026-05-04", "NORMAL", "WORKED"), true);
}

assert.equal(tryParseNumber("7.5"), 7.5);
assert.equal(tryParseNumber("7,5"), 7.5);
assert.equal(tryParseNumber("28075.50"), 28075.5);
assert.equal(tryParseNumber("20:00"), 20);
assert.equal(tryParseNumber("08:00"), 8);

{
  const record = worked("2026-05-04", 12);
  const changed = summary({ "2026-05-04": record }, { ...settings, dailyOvertimeThresholdHours: 8 });
  assert.equal(changed.dailyOvertimeHours, 4);
  assert.equal(round2(changed.overtimePay), 748.67);
}

console.log("Payroll tests passed.");
