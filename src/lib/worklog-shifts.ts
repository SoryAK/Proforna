export type ShiftWindow = {
  startMinute: number;
  endMinute: number;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function minutesFromTimeLabel(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

export function timeLabelFromMinutes(value: number): string {
  const safe = Math.max(0, Math.min(1439, Math.floor(value)));
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

export function localDateAndMinuteFromIso(iso: string) {
  const d = new Date(iso);
  return {
    localDate: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    minuteOfDay: d.getHours() * 60 + d.getMinutes(),
  };
}

function shiftLocalDate(localDate: string, deltaDays: number): string {
  const d = new Date(`${localDate}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function computeWorkdayDateLocal(
  localDate: string,
  minuteOfDay: number,
  shift: ShiftWindow | null,
): string {
  if (!shift) return localDate;

  const start = shift.startMinute;
  const end = shift.endMinute;

  if (start === end) return localDate;

  // Overnight shift: logs after midnight but before end belong to previous day.
  if (start > end) {
    if (minuteOfDay < end) return shiftLocalDate(localDate, -1);
    return localDate;
  }

  return localDate;
}

export function toIsoFromLocalDateTime(localDate: string, localTime: string): string | null {
  if (!localDate) return null;
  const time = localTime || "00:00";
  if (minutesFromTimeLabel(time) == null) return null;
  const d = new Date(`${localDate}T${time}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function toIsoFromLocalDate(localDate: string): string | null {
  if (!localDate) return null;
  const d = new Date(`${localDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
