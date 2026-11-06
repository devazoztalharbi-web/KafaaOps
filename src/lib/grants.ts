import { audit, many, one, run } from "./db";
import type { SessionUser } from "./auth";

export const capabilityNames = ["approve_join", "edit_fence"] as const;
export type Capability = (typeof capabilityNames)[number];

export function hasCapability(actor: SessionUser, capability: Capability) {
  if (!actor.companyId) return false;
  if (actor.role === "TECH_ADMIN") return true;
  if (capability === "approve_join" && one("SELECT user_id FROM join_approvers WHERE company_id = ? AND user_id = ?", actor.companyId, actor.id)) return true;
  return Boolean(one("SELECT user_id FROM capabilities WHERE company_id = ? AND user_id = ? AND capability = ?", actor.companyId, actor.id, capability));
}

export function setCapability(actor: SessionUser, userId: string, capability: string, grant: boolean) {
  if (!actor.companyId || actor.role !== "TECH_ADMIN") return { error: "err_permission" as const };
  if (!capabilityNames.includes(capability as Capability)) return { error: "err_permission" as const };
  const person = one<{ id: string }>("SELECT id FROM users WHERE id = ? AND company_id = ? AND status = 'ACTIVE'", userId, actor.companyId);
  if (!person || person.id === actor.id) return { error: "err_permission" as const };
  if (grant) {
    run(
      `INSERT INTO capabilities (company_id, user_id, capability, granted_by, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(company_id, user_id, capability) DO UPDATE SET granted_by = excluded.granted_by, created_at = excluded.created_at`,
      actor.companyId,
      person.id,
      capability,
      actor.id,
      new Date().toISOString(),
    );
    if (capability === "approve_join") {
      run(
        `INSERT INTO join_approvers (company_id, user_id, granted_by, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(company_id, user_id) DO UPDATE SET granted_by = excluded.granted_by, created_at = excluded.created_at`,
        actor.companyId,
        person.id,
        actor.id,
        new Date().toISOString(),
      );
    }
  } else {
    run("DELETE FROM capabilities WHERE company_id = ? AND user_id = ? AND capability = ?", actor.companyId, person.id, capability);
    if (capability === "approve_join") run("DELETE FROM join_approvers WHERE company_id = ? AND user_id = ?", actor.companyId, person.id);
  }
  audit(actor.companyId, actor.id, grant ? "capability.grant" : "capability.revoke", "user", person.id, { capability });
  return { userId: person.id };
}

export function grantedCapabilities(companyId: string) {
  return many<{ user_id: string; capability: string }>("SELECT user_id, capability FROM capabilities WHERE company_id = ?", companyId);
}
