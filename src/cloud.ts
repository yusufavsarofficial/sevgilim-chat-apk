import { CloudConfig, LocationStamp, ShiftRecord, ShiftType } from "./types";

type SupabaseShiftRow = {
  id: string;
  employee_code: string;
  start_at: string;
  end_at: string;
  break_minutes: number;
  shift_type: ShiftType;
  allowance: number;
  deduction: number;
  note: string;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_accuracy: number | null;
  check_in_at: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  check_out_accuracy: number | null;
  check_out_at: string | null;
};

function assertCloudConfig(config: CloudConfig): void {
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.employeeCode) {
    throw new Error("Supabase URL, anon key ve calisan kodu zorunlu.");
  }
}

function toLocation(
  lat: number | null,
  lng: number | null,
  accuracy: number | null,
  capturedAt: string | null
): LocationStamp | null {
  if (lat === null || lng === null || !capturedAt) {
    return null;
  }
  return {
    latitude: lat,
    longitude: lng,
    accuracy,
    capturedAt
  };
}

function toRow(employeeCode: string, shift: ShiftRecord): SupabaseShiftRow {
  return {
    id: shift.id,
    employee_code: employeeCode,
    start_at: shift.startAt,
    end_at: shift.endAt,
    break_minutes: shift.breakMinutes,
    shift_type: shift.shiftType,
    allowance: shift.allowance,
    deduction: shift.deduction,
    note: shift.note,
    check_in_lat: shift.checkInLocation?.latitude ?? null,
    check_in_lng: shift.checkInLocation?.longitude ?? null,
    check_in_accuracy: shift.checkInLocation?.accuracy ?? null,
    check_in_at: shift.checkInLocation?.capturedAt ?? null,
    check_out_lat: shift.checkOutLocation?.latitude ?? null,
    check_out_lng: shift.checkOutLocation?.longitude ?? null,
    check_out_accuracy: shift.checkOutLocation?.accuracy ?? null,
    check_out_at: shift.checkOutLocation?.capturedAt ?? null
  };
}

function fromRow(row: SupabaseShiftRow): ShiftRecord {
  return {
    id: row.id,
    startAt: row.start_at,
    endAt: row.end_at,
    breakMinutes: row.break_minutes,
    shiftType: row.shift_type,
    allowance: row.allowance,
    deduction: row.deduction,
    note: row.note ?? "",
    checkInLocation: toLocation(
      row.check_in_lat,
      row.check_in_lng,
      row.check_in_accuracy,
      row.check_in_at
    ),
    checkOutLocation: toLocation(
      row.check_out_lat,
      row.check_out_lng,
      row.check_out_accuracy,
      row.check_out_at
    )
  };
}

function headers(anonKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`
  };
}

export async function pushShiftsToSupabase(config: CloudConfig, shifts: ShiftRecord[]): Promise<void> {
  assertCloudConfig(config);
  const endpoint = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/work_logs?on_conflict=id`;
  const rows = shifts.map((shift) => toRow(config.employeeCode, shift));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...headers(config.supabaseAnonKey),
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase push hatasi: ${response.status} ${errorText}`);
  }
}

export async function pullShiftsFromSupabase(config: CloudConfig): Promise<ShiftRecord[]> {
  assertCloudConfig(config);
  const base = config.supabaseUrl.replace(/\/$/, "");
  const employee = encodeURIComponent(config.employeeCode);
  const endpoint = `${base}/rest/v1/work_logs?employee_code=eq.${employee}&order=start_at.desc`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: headers(config.supabaseAnonKey)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase pull hatasi: ${response.status} ${errorText}`);
  }

  const rows = (await response.json()) as SupabaseShiftRow[];
  return rows.map(fromRow);
}

