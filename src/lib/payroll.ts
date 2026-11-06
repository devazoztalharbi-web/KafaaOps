import { audit, many, one, run } from "./db";
import { leaveState } from "./ops";
import { addDays, dutyDateFor, eachDate, lateness, periodContaining, riyadhParts, shiftHasEnded } from "./time";
import type { SessionUser } from "./auth";

export type DayMark = "PRESENT" | "LATE" | "ABSENT" | "REST" | "LEAVE" | "OPEN" | "UNSET";

const WEEK = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

export function markDay(input: {
  schedule: "DUTY" | "REST" | null;
  onLeave: boolean;
  punchAt: string | null;
  shift: { start: number; end: number; grace: number } | null;
  date: string;
  now: Date;
}): DayMark {
  if (input.onLeave) return "LEAVE";
  if (input.schedule === "REST") return "REST";
  if (input.schedule !== "DUTY" || !input.shift) return "UNSET";
  if (input.punchAt) {
    const arrived = lateness(new Date(input.punchAt), input.date, input.shift.start, input.shift.grace);
    return arrived.status === "LATE" ? "LATE" : "PRESENT";
  }
  return shiftHasEnded(input.date, input.shift.start, input.shift.end, input.now) ? "ABSENT" : "OPEN";
}

export function weekRows(dates: string[]) {
  if (!dates.length) return [];
  const weekday = riyadhParts(new Date(`${dates[0]}T12:00:00+03:00`)).weekday;
  const pad = Math.max(0, WEEK.indexOf(weekday));
  const cells: Array<string | null> = [...Array(pad).fill(null), ...dates];
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

type Person = { id: string; name_ar: string; employee_no: string | null; role: string; shift_no: number | null; manager_id: string | null };
type Shift = { shift_no: number; start_minute: number; end_minute: number; grace_minute: number };

export function movement(companyId: string, now = new Date()) {
  const period = periodContaining(now);
  const dates = eachDate(period.start, period.end);
  const people = many<Person>(
    "SELECT id, name_ar, employee_no, role, shift_no, manager_id FROM users WHERE company_id = ? AND role IN ('GUARD', 'SUPERVISOR') AND status = 'ACTIVE' ORDER BY name_ar",
    companyId,
  );
  const shifts = new Map(
    many<Shift>("SELECT shift_no, start_minute, end_minute, grace_minute FROM shifts WHERE company_id = ?", companyId).map((shift) => [shift.shift_no, shift]),
  );
  const schedules = new Map(
    many<{ user_id: string; work_date: string; kind: string }>(
      "SELECT user_id, work_date, kind FROM schedules WHERE company_id = ? AND work_date >= ? AND work_date <= ?",
      companyId,
      period.start,
      period.end,
    ).map((row) => [`${row.user_id}:${row.work_date}`, row.kind]),
  );
  const punches = many<{ user_id: string; server_time: string; kind: string }>(
    "SELECT user_id, server_time, kind FROM punches WHERE company_id = ? AND kind = 'IN'",
    companyId,
  );
  const leaves = many<{ id: string; user_id: string; start_date: string; end_date: string; type: string }>(
    "SELECT id, user_id, start_date, end_date, type FROM leave_requests WHERE company_id = ?",
    companyId,
  ).filter((leave) => leaveState(leave.id) === "APPROVED");
  const rows = people.map((person) => {
    const shift = person.shift_no == null ? null : shifts.get(person.shift_no) ?? null;
    const days = Object.fromEntries(
      dates.map((date) => {
        const onLeave = leaves.some((leave) => leave.user_id === person.id && leave.start_date <= date && leave.end_date >= date);
        const scheduled = schedules.get(`${person.id}:${date}`);
        const punch = shift
          ? punches.find((item) => item.user_id === person.id && dutyDateFor(new Date(item.server_time), shift.start_minute, shift.end_minute) === date)
          : undefined;
        const arrived = punch && shift ? lateness(new Date(punch.server_time), date, shift.start_minute, shift.grace_minute) : null;
        const mark = markDay({
          schedule: scheduled === "DUTY" || scheduled === "REST" ? scheduled : null,
          onLeave,
          punchAt: punch?.server_time ?? null,
          shift: shift ? { start: shift.start_minute, end: shift.end_minute, grace: shift.grace_minute } : null,
          date,
          now,
        });
        return [date, { mark, late: arrived?.status === "LATE" ? arrived.late : 0 }] as const;
      }),
    ) as Record<string, { mark: DayMark; late: number }>;
    const absent = Object.values(days).filter((day) => day.mark === "ABSENT").length;
    const lateMinutes = Object.values(days).reduce((sum, day) => sum + day.late, 0);
    return { ...person, days, absent, lateMinutes };
  });
  return { period, dates, weeks: weekRows(dates), rows };
}

export function lateLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (minutes <= 0) return "0";
  if (!hours) return `${rest} د`;
  if (!rest) return `${hours} س`;
  return `${hours} س ${rest} د`;
}

export function payrollReleased(companyId: string, userId: string, periodStart = periodContaining().start) {
  return Boolean(one("SELECT user_id FROM payroll_releases WHERE company_id = ? AND user_id = ? AND period_start = ?", companyId, userId, periodStart));
}

export function canOpenPayroll(actor: SessionUser) {
  if (!actor.companyId) return false;
  if (["HR", "TECH_ADMIN", "SECURITY_MANAGER", "SUPERVISOR"].includes(actor.role)) return true;
  return actor.role === "GUARD" && payrollReleased(actor.companyId, actor.id);
}

export function issuePayroll(actor: SessionUser, userIds: string[]) {
  if (!actor.companyId || !["SUPERVISOR", "TECH_ADMIN", "SECURITY_MANAGER", "HR"].includes(actor.role)) return { error: "err_permission" as const };
  const period = periodContaining();
  const now = new Date().toISOString();
  let count = 0;
  for (const userId of userIds) {
    const person = one<Person>("SELECT id, name_ar, employee_no, role, shift_no, manager_id FROM users WHERE id = ? AND company_id = ? AND status = 'ACTIVE'", userId, actor.companyId);
    if (!person || (person.role !== "GUARD" && person.role !== "SUPERVISOR")) continue;
    if (actor.role === "SUPERVISOR" && person.id !== actor.id && person.manager_id !== actor.id) continue;
    run(
      `INSERT INTO payroll_releases (company_id, user_id, period_start, issued_at, issued_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(company_id, user_id, period_start) DO UPDATE SET issued_at = excluded.issued_at, issued_by = excluded.issued_by`,
      actor.companyId,
      person.id,
      period.start,
      now,
      actor.id,
    );
    count += 1;
    run("DELETE FROM payroll_requests WHERE company_id = ? AND user_id = ? AND period_start = ?", actor.companyId, person.id, period.start);
  }
  if (!count) return { error: "err_permission" as const };
  audit(actor.companyId, actor.id, "payroll.issue", "company", actor.companyId, { count, period: period.start });
  return { count };
}

export function requestOwnPayroll(actor: SessionUser) {
  if (!actor.companyId || actor.role !== "GUARD") return { error: "err_permission" as const };
  const period = periodContaining();
  if (payrollReleased(actor.companyId, actor.id, period.start)) return { count: 1 };
  run(
    `INSERT INTO payroll_requests (company_id, user_id, period_start, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(company_id, user_id, period_start) DO NOTHING`,
    actor.companyId,
    actor.id,
    period.start,
    new Date().toISOString(),
  );
  audit(actor.companyId, actor.id, "payroll.request", "user", actor.id, { period: period.start });
  return { count: 1 };
}

export function payrollRequests(actor: SessionUser) {
  if (!actor.companyId || actor.role !== "SUPERVISOR") return [];
  const period = periodContaining();
  return many<{ id: string; name_ar: string; employee_no: string | null }>(
    `SELECT users.id, users.name_ar, users.employee_no
     FROM payroll_requests
     JOIN users ON users.id = payroll_requests.user_id
     WHERE payroll_requests.company_id = ? AND payroll_requests.period_start = ? AND users.manager_id = ?
     ORDER BY users.name_ar`,
    actor.companyId,
    period.start,
    actor.id,
  );
}

export function saveSchedule(actor: SessionUser, userId: string, entries: Array<{ date: string; kind: string }>) {
  if (!actor.companyId) return { error: "err_permission" as const };
  if (!["TECH_ADMIN", "SECURITY_MANAGER", "SUPERVISOR"].includes(actor.role)) return { error: "err_permission" as const };
  const person = one<Person>("SELECT id, name_ar, employee_no, role, shift_no, manager_id FROM users WHERE id = ? AND company_id = ? AND status = 'ACTIVE'", userId, actor.companyId);
  if (!person || (person.role !== "GUARD" && person.role !== "SUPERVISOR")) return { error: "err_permission" as const };
  if (actor.role === "SUPERVISOR" && person.id !== actor.id && person.manager_id !== actor.id) return { error: "err_permission" as const };
  const period = periodContaining();
  const clean = entries.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && (entry.kind === "DUTY" || entry.kind === "REST") && entry.date >= period.start && entry.date <= period.end);
  if (!clean.length || clean.length > 62) return { error: "err_schedule" as const };
  for (const entry of clean) {
    run(
      `INSERT INTO schedules (id, company_id, user_id, work_date, kind) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, work_date) DO UPDATE SET kind = excluded.kind`,
      crypto.randomUUID(),
      actor.companyId,
      person.id,
      entry.date,
      entry.kind,
    );
  }
  audit(actor.companyId, actor.id, "schedule.save", "user", person.id, { days: clean.length });
  return { saved: clean.length };
}

export function parseScheduleCsv(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("="))
    .map((line) => {
      const [date, kind] = line.split(/[,;\t]/).map((part) => part.trim().toUpperCase());
      const normalized = kind === "راحة" || kind === "REST" ? "REST" : kind === "دوام" || kind === "DUTY" ? "DUTY" : kind;
      return { date, kind: normalized };
    })
    .filter((entry) => entry.date !== "DATE");
}

export function nextPeriodHint(date = new Date()) {
  const period = periodContaining(date);
  return { ...period, after: addDays(period.end, 1) };
}
