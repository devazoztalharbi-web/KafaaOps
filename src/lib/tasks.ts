import { audit, many, one, run } from "./db";
import { periodContaining, riyadhParts } from "./time";
import type { SessionUser } from "./auth";

type TaskRow = {
  id: string;
  company_id: string;
  guard_id: string;
  supervisor_id: string | null;
  site_id: string;
  duty_date: string;
  status: string;
  rating: number | null;
  review_note: string | null;
};

const OPEN = ["OPEN", "SUBMITTED"];

function guardInCompany(companyId: string, guardId: string) {
  return one<{ id: string; manager_id: string | null; role: string }>(
    "SELECT id, manager_id, role FROM users WHERE id = ? AND company_id = ? AND status = 'ACTIVE'",
    guardId,
    companyId,
  );
}

export function visibleTasks(actor: SessionUser) {
  if (!actor.companyId) return [];
  const rows = many<TaskRow & { guard_name: string; site_name: string }>(
    `SELECT tasks.*, users.name_ar AS guard_name, sites.name_ar AS site_name
     FROM tasks
     JOIN users ON users.id = tasks.guard_id
     JOIN sites ON sites.id = tasks.site_id
     WHERE tasks.company_id = ?
     ORDER BY tasks.duty_date DESC, tasks.created_at DESC`,
    actor.companyId,
  );
  if (actor.role === "GUARD") return rows.filter((row) => row.guard_id === actor.id);
  if (actor.role === "SUPERVISOR") return rows.filter((row) => row.guard_id === actor.id || row.supervisor_id === actor.id);
  if (["TECH_ADMIN", "SECURITY_MANAGER", "HR"].includes(actor.role)) return rows;
  return [];
}

export function createTask(actor: SessionUser, input: { guardId: string; siteId: string; dutyDate: string }) {
  if (!actor.companyId || !["SUPERVISOR", "SECURITY_MANAGER", "TECH_ADMIN"].includes(actor.role)) return { error: "err_permission" as const };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dutyDate)) return { error: "err_task_date" as const };
  const period = periodContaining();
  if (input.dutyDate < period.start || input.dutyDate > period.end) return { error: "err_task_date" as const };
  const guard = guardInCompany(actor.companyId, input.guardId);
  if (!guard || guard.role !== "GUARD") return { error: "err_permission" as const };
  if (actor.role === "SUPERVISOR" && guard.manager_id !== actor.id) return { error: "err_permission" as const };
  const site = one<{ id: string }>("SELECT id FROM sites WHERE id = ? AND company_id = ? AND kind IN ('COMPLEX', 'SITE') AND active = 1", input.siteId, actor.companyId);
  if (!site) return { error: "err_permission" as const };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  run(
    `INSERT INTO tasks (id, company_id, guard_id, supervisor_id, site_id, duty_date, status, rating, review_note, created_at, submitted_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'OPEN', NULL, NULL, ?, NULL, NULL)`,
    id,
    actor.companyId,
    guard.id,
    guard.manager_id,
    site.id,
    input.dutyDate,
    now,
  );
  audit(actor.companyId, actor.id, "task.create", "task", id, { guardId: guard.id, dutyDate: input.dutyDate });
  return { id };
}

export function submitTask(actor: SessionUser, taskId: string) {
  if (!actor.companyId) return { error: "err_permission" as const };
  const task = one<TaskRow>("SELECT * FROM tasks WHERE id = ? AND company_id = ?", taskId, actor.companyId);
  if (!task || task.guard_id !== actor.id || task.status !== "OPEN") return { error: "err_permission" as const };
  const now = new Date().toISOString();
  run("UPDATE tasks SET status = 'SUBMITTED', submitted_at = ? WHERE id = ?", now, task.id);
  audit(actor.companyId, actor.id, "task.submit", "task", task.id, {});
  return { status: "SUBMITTED" as const };
}

export function closeTask(actor: SessionUser, taskId: string, rating: number, note: string) {
  if (!actor.companyId || actor.role !== "SUPERVISOR") return { error: "err_permission" as const };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "err_rating" as const };
  const task = one<TaskRow>("SELECT * FROM tasks WHERE id = ? AND company_id = ?", taskId, actor.companyId);
  if (!task || task.status !== "SUBMITTED" || task.supervisor_id !== actor.id) return { error: "err_permission" as const };
  const now = new Date().toISOString();
  run("UPDATE tasks SET status = 'CLOSED', rating = ?, review_note = ?, closed_at = ? WHERE id = ?", rating, note.slice(0, 300), now, task.id);
  audit(actor.companyId, actor.id, "task.close", "task", task.id, { rating });
  return { status: "CLOSED" as const };
}

export function cancelTask(actor: SessionUser, taskId: string) {
  if (!actor.companyId || !["SUPERVISOR", "SECURITY_MANAGER"].includes(actor.role)) return { error: "err_permission" as const };
  const task = one<TaskRow>("SELECT * FROM tasks WHERE id = ? AND company_id = ?", taskId, actor.companyId);
  if (!task || task.status !== "OPEN") return { error: "err_permission" as const };
  if (actor.role === "SUPERVISOR" && task.supervisor_id !== actor.id) return { error: "err_permission" as const };
  run("UPDATE tasks SET status = 'CANCELLED', closed_at = ? WHERE id = ?", new Date().toISOString(), task.id);
  audit(actor.companyId, actor.id, "task.cancel", "task", task.id, {});
  return { status: "CANCELLED" as const };
}

export function openTaskCount(userId: string) {
  const row = one<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE guard_id = ? AND status IN ('OPEN', 'SUBMITTED')", userId);
  return row?.count ?? 0;
}

export function suspendEmployee(actor: SessionUser, userId: string) {
  if (!actor.companyId || !["TECH_ADMIN", "SECURITY_MANAGER"].includes(actor.role)) return { error: "err_permission" as const };
  if (actor.id === userId) return { error: "err_permission" as const };
  const person = one<{ id: string; role: string }>("SELECT id, role FROM users WHERE id = ? AND company_id = ? AND status = 'ACTIVE'", userId, actor.companyId);
  if (!person || person.role === "TECH_ADMIN") return { error: "err_permission" as const };
  if (openTaskCount(person.id) > 0) return { error: "err_open_task" as const };
  run("UPDATE users SET status = 'SUSPENDED' WHERE id = ?", person.id);
  audit(actor.companyId, actor.id, "user.suspend", "user", person.id, {});
  return { status: "SUSPENDED" as const };
}

export function dutyLines(companyId: string, userId: string, date: string) {
  const lines: string[] = [];
  const point = one<{ label: string }>(
    `SELECT site_points.label FROM postings
     JOIN site_points ON site_points.id = postings.point_id
     WHERE postings.company_id = ? AND postings.user_id = ? AND postings.duty_date = ?`,
    companyId,
    userId,
    date,
  );
  if (point) lines.push(`التوجيه: ${point.label}`);
  const punches = many<{ kind: string; server_time: string }>(
    "SELECT kind, server_time FROM punches WHERE company_id = ? AND user_id = ? ORDER BY server_time DESC LIMIT 12",
    companyId,
    userId,
  );
  for (const punch of punches) {
    if (riyadhParts(new Date(punch.server_time)).date !== date) continue;
    lines.push(punch.kind === "IN" ? "بصمة دخول" : punch.kind === "OUT" ? "بصمة خروج" : "حركة حضور");
  }
  const permits = many<{ decision: string | null; note: string | null; created_at: string }>(
    "SELECT decision, note, created_at FROM permits WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 12",
    companyId,
    userId,
  );
  const decisionLabel: Record<string, string> = { ALLOWED: "سماح بالدخول", REFUSED: "منع الدخول", INFORMED: "إبلاغ صاحب التصريح" };
  for (const permit of permits) {
    if (riyadhParts(new Date(permit.created_at)).date !== date || !permit.decision) continue;
    lines.push(`تصريح مصوّر: ${decisionLabel[permit.decision] ?? permit.decision}${permit.note ? ` · ${permit.note}` : ""}`);
  }
  const custody = many<{ kind: string; device_no: string | null; created_at: string }>(
    "SELECT kind, device_no, created_at FROM custody_logs WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 12",
    companyId,
    userId,
  );
  const custodyLabel: Record<string, string> = { RADIO: "استلام لاسلكي", RADIO_IN: "تسليم لاسلكي", VEHICLE_OUT: "استلام سيارة", VEHICLE_IN: "إعادة سيارة" };
  for (const row of custody) {
    if (riyadhParts(new Date(row.created_at)).date !== date) continue;
    lines.push(`${custodyLabel[row.kind] ?? row.kind}${row.device_no ? ` · ${row.device_no}` : ""}`);
  }
  const alerts = many<{ kind: string; body: string; created_at: string }>(
    "SELECT kind, body, created_at FROM alerts WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 12",
    companyId,
    userId,
  );
  for (const alert of alerts) {
    if (riyadhParts(new Date(alert.created_at)).date !== date) continue;
    lines.push(`${alert.kind === "CHILD" ? "بلاغ طفل" : "بلاغ طارئ"}: ${alert.body}`);
  }
  return lines.length ? lines : ["لا يوجد إجراء مسجّل في هذا اليوم."];
}
