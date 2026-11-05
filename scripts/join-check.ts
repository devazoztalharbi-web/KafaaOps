import { login } from "../src/lib/auth";
import { sha256 } from "../src/lib/crypto";
import { db } from "../src/lib/db";
import { livenessFrom } from "../src/lib/face";
import { approveJoin, grantJoinApproval, requestJoin } from "../src/lib/join";

let passed = 0;
let total = 0;
function check(name: string, ok: boolean, detail: string) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  if (!ok) process.exitCode = 1;
}

const blinkAndTurn = livenessFrom([0.31, 0.3, 0.18, 0.29, 0.3, 0.28], [0, 0.02, -0.2, 0.05, 0.22, 0.04]);
const smileOnly = livenessFrom([0.3, 0.31, 0.29, 0.3, 0.3, 0.28], [0.2, 0.22, 0.21, 0.19, 0.2, 0.18]);
const blinkOnly = livenessFrom([0.31, 0.16, 0.3, 0.29, 0.3, 0.28], [0.02, 0.01, 0.03, 0.02, 0.01, 0.04]);
check("blink plus head turn counts as liveness", blinkAndTurn, String(blinkAndTurn));
check("a smile without a blink does not", !smileOnly, String(smileOnly));
check("a blink without a head turn does not", !blinkOnly, String(blinkOnly));

const guard = login("guard@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "join-check" });
const tech = login("tech@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "join-check" });
const hr = login("hr@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "join-check" });
if (!("user" in guard) || !("user" in tech) || !("user" in hr) || !guard.user.companyId || !guard.user.siteId || !guard.user.managerId) {
  throw new Error("seed login failed");
}

const email = `new.${crypto.randomUUID().slice(0, 8)}@kafaaops.local`;
const badCode = requestJoin({ name: "موظف جديد", email, password: "Kafaa.Ops#2026", joinCode: "NOPE" });
check("unknown company code is refused", "error" in badCode && badCode.error === "err_join_code", "error" in badCode ? badCode.error : "joined");
const joined = requestJoin({ name: "موظف جديد", email, password: "Kafaa.Ops#2026", joinCode: "NAJD-TNS" });
check("name, email, and company code create a request", "id" in joined, "error" in joined ? joined.error : joined.id);
const pending = login(email, "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "join-check" });
check("pending employee cannot enter yet", "error" in pending && pending.error === "err_pending", "error" in pending ? pending.error : "entered");
const guardApprove = "id" in joined ? approveJoin(guard.user, { userId: joined.id, siteId: guard.user.siteId, shiftNo: 1, managerId: guard.user.managerId }) : { error: "err_permission" as const };
check("guard cannot approve a join request", "error" in guardApprove, "error" in guardApprove ? guardApprove.error : "approved");
const hrBefore = "id" in joined ? approveJoin(hr.user, { userId: joined.id, siteId: guard.user.siteId, shiftNo: 1, managerId: guard.user.managerId }) : { error: "err_permission" as const };
check("hr cannot approve before the technician grants it", "error" in hrBefore, "error" in hrBefore ? hrBefore.error : "approved");
const granted = grantJoinApproval(tech.user, hr.user.id);
check("technician grants join approval", "userId" in granted, "error" in granted ? granted.error : granted.userId);
const approved = "id" in joined ? approveJoin(hr.user, { userId: joined.id, siteId: guard.user.siteId, shiftNo: 1, managerId: guard.user.managerId }) : { error: "err_permission" as const };
check("granted person approves and assigns site and shift", "employeeNo" in approved, "error" in approved ? approved.error : approved.employeeNo);
const entered = login(email, "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "join-check" });
check("approved employee can sign in", "user" in entered, "error" in entered ? entered.error : entered.user.email);

if ("user" in entered) {
  db().prepare("DELETE FROM sessions WHERE user_id = ?").run(entered.user.id);
  db().prepare("DELETE FROM users WHERE id = ?").run(entered.user.id);
}
db().prepare("DELETE FROM login_throttle WHERE email_hash = ?").run(sha256(email));
db().prepare("DELETE FROM join_approvers WHERE user_id = ?").run(hr.user.id);
console.log(`${passed}/${total} join checks passed`);
