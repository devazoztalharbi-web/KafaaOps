import { audit, many, one, run } from "./db";
import { hashPassword, passwordIssues } from "./crypto";
import type { SessionUser } from "./auth";

export function requestJoin(input: { name: string; email: string; password: string; joinCode: string }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const code = input.joinCode.trim();
  if (name.length < 3 || name.length > 80) return { error: "err_join" as const };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "err_join" as const };
  if (passwordIssues(input.password)) return { error: "err_password" as const };
  const company = one<{ id: string }>("SELECT id FROM companies WHERE join_code = ?", code);
  if (!company) return { error: "err_join_code" as const };
  const existing = one<{ id: string }>("SELECT id FROM users WHERE email = ?", email);
  if (existing) return { error: "err_email" as const };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  run(
    `INSERT INTO users
     (id, company_id, email, name_ar, name_en, password_hash, role, status, employee_no, manager_id, shift_no, site_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'GUARD', 'PENDING', NULL, NULL, NULL, NULL, ?)`,
    id,
    company.id,
    email,
    name,
    name,
    hashPassword(input.password),
    now,
  );
  audit(company.id, id, "join.request", "user", id, { email });
  return { id };
}

export function canApproveJoin(actor: SessionUser) {
  if (!actor.companyId) return false;
  if (actor.role === "TECH_ADMIN") return true;
  return Boolean(one("SELECT user_id FROM join_approvers WHERE company_id = ? AND user_id = ?", actor.companyId, actor.id));
}

export function grantJoinApproval(actor: SessionUser, userId: string) {
  if (!actor.companyId || actor.role !== "TECH_ADMIN") return { error: "err_permission" as const };
  const person = one<{ id: string }>("SELECT id FROM users WHERE id = ? AND company_id = ? AND status = 'ACTIVE'", userId, actor.companyId);
  if (!person || person.id === actor.id) return { error: "err_permission" as const };
  run(
    `INSERT INTO join_approvers (company_id, user_id, granted_by, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(company_id, user_id) DO UPDATE SET granted_by = excluded.granted_by, created_at = excluded.created_at`,
    actor.companyId,
    person.id,
    actor.id,
    new Date().toISOString(),
  );
  audit(actor.companyId, actor.id, "join.grant", "user", person.id, {});
  return { userId: person.id };
}

export function revokeJoinApproval(actor: SessionUser, userId: string) {
  if (!actor.companyId || actor.role !== "TECH_ADMIN") return { error: "err_permission" as const };
  run("DELETE FROM join_approvers WHERE company_id = ? AND user_id = ?", actor.companyId, userId);
  audit(actor.companyId, actor.id, "join.revoke", "user", userId, {});
  return { userId };
}

export function listPending(actor: SessionUser) {
  if (!canApproveJoin(actor) || !actor.companyId) return [];
  return many<{ id: string; name_ar: string; email: string; created_at: string }>(
    "SELECT id, name_ar, email, created_at FROM users WHERE company_id = ? AND status = 'PENDING' ORDER BY created_at",
    actor.companyId,
  );
}

export function approveJoin(actor: SessionUser, input: { userId: string; siteId: string; shiftNo: number; managerId: string }) {
  if (!canApproveJoin(actor) || !actor.companyId) return { error: "err_permission" as const };
  if (![1, 2, 3].includes(input.shiftNo)) return { error: "err_join" as const };
  const person = one<{ id: string }>("SELECT id FROM users WHERE id = ? AND company_id = ? AND status = 'PENDING'", input.userId, actor.companyId);
  const site = one<{ id: string }>("SELECT id FROM sites WHERE id = ? AND company_id = ? AND kind = 'SITE' AND active = 1", input.siteId, actor.companyId);
  const manager = one<{ id: string }>("SELECT id FROM users WHERE id = ? AND company_id = ? AND role = 'SUPERVISOR' AND status = 'ACTIVE'", input.managerId, actor.companyId);
  if (!person || !site || !manager) return { error: "err_join" as const };
  const employeeNo = `G-${String(Date.now()).slice(-6)}`;
  run(
    "UPDATE users SET status = 'ACTIVE', site_id = ?, shift_no = ?, manager_id = ?, employee_no = ? WHERE id = ?",
    site.id,
    input.shiftNo,
    manager.id,
    employeeNo,
    person.id,
  );
  audit(actor.companyId, actor.id, "join.approve", "user", person.id, { siteId: site.id, shiftNo: input.shiftNo });
  return { employeeNo };
}

export function rejectJoin(actor: SessionUser, userId: string) {
  if (!canApproveJoin(actor) || !actor.companyId) return { error: "err_permission" as const };
  const person = one<{ id: string }>("SELECT id FROM users WHERE id = ? AND company_id = ? AND status = 'PENDING'", userId, actor.companyId);
  if (!person) return { error: "err_permission" as const };
  run("UPDATE users SET status = 'REJECTED' WHERE id = ?", person.id);
  audit(actor.companyId, actor.id, "join.reject", "user", person.id, {});
  return { status: "REJECTED" as const };
}
