require("ts-node/register");

const assert = require("assert");
const { calculatePayroll, parsePayrollNumber } = require("../src/utils/calculatePayroll.ts");

function approx(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: expected ${expected}, got ${actual}`);
}

approx(parsePayrollNumber("4,5"), 4.5, "Virgüllü saat parse");
approx(parsePayrollNumber("4.5"), 4.5, "Noktalı saat parse");
approx(parsePayrollNumber("33.030"), 33030, "TRY binlik parse");

const baseSettings = {
  monthlyNetSalary: 33030,
  normalMonthlyHours: 225,
  weeklyLegalHours: 45,
  overtimeMultiplier: 1.5,
  sundayMultiplier: 2.5,
  ubgtMultiplier: 1,
  nightPremiumRate: 0.25,
  deductBreak: false,
  includeMealRoadOnSundayHoliday: false,
  mealAmount: 100,
  roadAmount: 50
};

const nightShift = calculatePayroll(
  [{ date: "2026-05-04", startTime: "20:00", endTime: "08:00", isSunday: false, isOfficialHoliday: false }],
  baseSettings
);
approx(nightShift.totalHours, 12, "20:00-08:00 vardiya");
approx(nightShift.saatlikUcret, 33030 / 225, "Saatlik ücret");

const withBreak = calculatePayroll(
  [{ date: "2026-05-04", startTime: "20:00", endTime: "08:00", breakMinutes: 60 }],
  { ...baseSettings, deductBreak: true }
);
approx(withBreak.totalHours, 11, "Mola varsa düşülür");

const sunday = calculatePayroll(
  [{ date: "2026-05-03", startTime: "09:00", endTime: "17:00", isSunday: true }],
  baseSettings
);
approx(sunday.mealRoadPay, 0, "Pazar yemek/yol dahil edilmez");

const weekly = calculatePayroll(
  [
    { date: "2026-05-04", startTime: "08:00", endTime: "18:00" },
    { date: "2026-05-05", startTime: "08:00", endTime: "18:00" },
    { date: "2026-05-06", startTime: "08:00", endTime: "18:00" },
    { date: "2026-05-07", startTime: "08:00", endTime: "18:00" },
    { date: "2026-05-08", startTime: "08:00", endTime: "18:00" }
  ],
  baseSettings
);
approx(weekly.overtimeHours, 5, "Haftalık 45 üstü fazla mesai");

const monthlyEntries = Array.from({ length: 23 }, (_, index) => ({
  date: `2026-05-${String(index + 1).padStart(2, "0")}`,
  startTime: "08:00",
  endTime: "18:00"
}));
const monthly = calculatePayroll(monthlyEntries, baseSettings);
assert.ok(monthly.totalHours > 225, "Aylık 225 üstü tespit edilir");

console.log("Payroll calculator smoke tests passed.");
