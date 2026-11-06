import { audit, many, one, run } from "./db";
import { hashPassword, passwordIssues } from "./crypto";
import { hasCapability } from "./grants";
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
  return hasCapability(actor, "approve_join");
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

const joinRoles = ["SECURITY_MANAGER", "SUPERVISOR", "GUARD", "HR"] as const;
type JoinRole = (typeof joinRoles)[number];

export function approveJoin(actor: SessionUser, input: { userId: string; siteId: string; shiftNo: number; managerId: string; role?: string }) {
  if (!canApproveJoin(actor) || !actor.companyId) return { error: "err_permission" as const };
  const role: JoinRole = joinRoles.includes(input.role as JoinRole) ? (input.role as JoinRole) : "GUARD";
  if (role !== "GUARD" && actor.role !== "TECH_ADMIN") return { error: "err_permission" as const };
  const person = one<{ id: string }>("SELECT id FROM users WHERE id = ? AND company_id = ? AND status = 'PENDING'", input.userId, actor.companyId);
  if (!person) return { error: "err_join" as const };
  const stamp = String(Date.now()).slice(-6);
  const activate = (employeeNo: string, siteId: string | null, shiftNo: number | null, managerId: string | null) => {
    run(
      "UPDATE users SET status = 'ACTIVE', role = ?, site_id = ?, shift_no = ?, manager_id = ?, employee_no = ? WHERE id = ?",
      role,
      siteId,
      shiftNo,
      managerId,
      employeeNo,
      person.id,
    );
    audit(actor.companyId!, actor.id, "join.approve", "user", person.id, { role, siteId, shiftNo });
    return { employeeNo };
  };
  if (role === "HR") return activate(`H-${stamp}`, null, null, null);
  const site = one<{ id: string }>("SELECT id FROM sites WHERE id = ? AND company_id = ? AND kind IN ('COMPLEX', 'SITE') AND active = 1", input.siteId, actor.companyId);
  if (!site) return { error: "err_join" as const };
  if (role === "SECURITY_MANAGER") return activate(`S-${stamp}`, site.id, null, null);
  if (role === "SUPERVISOR") {
    if (![1, 2, 3].includes(input.shiftNo)) return { error: "err_join" as const };
    const manager = one<{ id: string }>("SELECT id FROM users WHERE id = ? AND company_id = ? AND role = 'SECURITY_MANAGER' AND status = 'ACTIVE'", input.managerId, actor.companyId);
    if (!manager) return { error: "err_join" as const };
    return activate(`P-${stamp}`, site.id, input.shiftNo, manager.id);
  }
  const supervisor = one<{ id: string; shift_no: number | null }>(
    "SELECT id, shift_no FROM users WHERE id = ? AND company_id = ? AND role = 'SUPERVISOR' AND status = 'ACTIVE'",
    input.managerId,
    actor.companyId,
  );
  if (!supervisor || supervisor.shift_no == null) return { error: "err_join" as const };
  return activate(`G-${stamp}`, site.id, supervisor.shift_no, supervisor.id);
}

export function rejectJoin(actor: SessionUser, userId: string) {
  if (!canApproveJoin(actor) || !actor.companyId) return { error: "err_permission" as const };
  const person = one<{ id: string }>("SELECT id FROM users WHERE id = ? AND company_id = ? AND status = 'PENDING'", userId, actor.companyId);
  if (!person) return { error: "err_permission" as const };
  run("UPDATE users SET status = 'REJECTED' WHERE id = ?", person.id);
  audit(actor.companyId, actor.id, "join.reject", "user", person.id, {});
  return { status: "REJECTED" as const };
}
