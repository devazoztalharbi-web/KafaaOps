import { audit, many, one, run } from "./db";
import { riyadhParts } from "./time";
import { hasCapability } from "./grants";
import type { SessionUser } from "./auth";

export function addPoint(actor: SessionUser, siteId: string, label: string) {
  if (!hasCapability(actor, "edit_fence") || !actor.companyId) return { error: "err_permission" as const };
  const name = label.trim();
  if (name.length < 1 || name.length > 40 || /[\r\n]/.test(name)) return { error: "err_label" as const };
  const site = one<{ id: string }>("SELECT id FROM sites WHERE id = ? AND company_id = ? AND kind = 'SITE' AND active = 1", siteId, actor.companyId);
  if (!site) return { error: "err_permission" as const };
  const existing = one<{ id: string }>("SELECT id FROM site_points WHERE company_id = ? AND site_id = ? AND label = ?", actor.companyId, site.id, name);
  if (existing) return { error: "err_label" as const };
  const id = crypto.randomUUID();
  run(
    "INSERT INTO site_points (id, company_id, site_id, label, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    actor.companyId,
    site.id,
    name,
    new Date().toISOString(),
  );
  audit(actor.companyId, actor.id, "point.add", "site", site.id, { label: name });
  return { id, label: name };
}

export function listPoints(companyId: string) {
  return many<{ id: string; label: string; site_name: string }>(
    `SELECT site_points.id, site_points.label, sites.name_ar AS site_name
     FROM site_points JOIN sites ON sites.id = site_points.site_id
     WHERE site_points.company_id = ? AND sites.active = 1
     ORDER BY sites.name_ar, site_points.label`,
    companyId,
  );
}

export function directPerson(actor: SessionUser, userId: string, pointId: string) {
  if (!actor.companyId || actor.role !== "SUPERVISOR") return { error: "err_permission" as const };
  const guard = one<{ id: string }>(
    "SELECT id FROM users WHERE id = ? AND company_id = ? AND role = 'GUARD' AND status = 'ACTIVE' AND manager_id = ?",
    userId,
    actor.companyId,
    actor.id,
  );
  const point = one<{ id: string }>("SELECT id FROM site_points WHERE id = ? AND company_id = ?", pointId, actor.companyId);
  if (!guard || !point) return { error: "err_permission" as const };
  const dutyDate = riyadhParts().date;
  const now = new Date().toISOString();
  run(
    `INSERT INTO postings (id, company_id, user_id, point_id, duty_date, assigned_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, duty_date) DO UPDATE SET point_id = excluded.point_id, assigned_by = excluded.assigned_by, created_at = excluded.created_at`,
    crypto.randomUUID(),
    actor.companyId,
    guard.id,
    point.id,
    dutyDate,
    actor.id,
    now,
  );
  audit(actor.companyId, actor.id, "posting.direct", "user", guard.id, { pointId: point.id, dutyDate });
  return { dutyDate };
}

export function todayPosting(companyId: string, userId: string) {
  return one<{ label: string; site_name: string }>(
    `SELECT site_points.label, sites.name_ar AS site_name
     FROM postings
     JOIN site_points ON site_points.id = postings.point_id
     JOIN sites ON sites.id = site_points.site_id
     WHERE postings.company_id = ? AND postings.user_id = ? AND postings.duty_date = ?`,
    companyId,
    userId,
    riyadhParts().date,
  );
}

export function teamPostings(actor: SessionUser) {
  if (!actor.companyId || actor.role !== "SUPERVISOR") return [];
  return many<{ name_ar: string; label: string; site_name: string }>(
    `SELECT users.name_ar, site_points.label, sites.name_ar AS site_name
     FROM postings
     JOIN users ON users.id = postings.user_id
     JOIN site_points ON site_points.id = postings.point_id
     JOIN sites ON sites.id = site_points.site_id
     WHERE postings.company_id = ? AND postings.duty_date = ? AND users.manager_id = ?
     ORDER BY users.name_ar`,
    actor.companyId,
    riyadhParts().date,
    actor.id,
  );
}
