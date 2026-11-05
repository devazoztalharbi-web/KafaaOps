export function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function riyadhParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const minute = Number(parts.minute);
  return {
    year,
    month,
    day,
    hour,
    minute,
    date: isoDate(year, month, day),
    minutes: hour * 60 + minute,
    weekday: parts.weekday,
  };
}

export function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function eachDate(start: string, end: string) {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

export function periodContaining(date = new Date()) {
  const local = riyadhParts(date);
  let year = local.year;
  let month = local.month;
  if (local.day < 21) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  const start = isoDate(year, month, 21);
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  return { start, end: isoDate(endYear, endMonth, 20) };
}

export function formatWhen(iso: string, locale: "ar" | "en") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function dutyDateFor(now: Date, startMin: number, endMin: number) {
  const local = riyadhParts(now);
  if (endMin <= startMin && local.minutes < endMin) return addDays(local.date, -1);
  return local.date;
}

export function lateness(now: Date, duty: string, startMin: number, grace: number) {
  const local = riyadhParts(now);
  const delta = local.date === duty ? local.minutes - startMin : local.minutes + 1440 - startMin;
  if (delta <= grace) return { status: "PRESENT" as const, late: Math.max(0, delta) };
  return { status: "LATE" as const, late: delta };
}

export function shiftHasEnded(duty: string, startMin: number, endMin: number, now = new Date()) {
  const endDate = endMin <= startMin ? addDays(duty, 1) : duty;
  const local = riyadhParts(now);
  if (local.date > endDate) return true;
  if (local.date < endDate) return false;
  return local.minutes >= endMin;
}
