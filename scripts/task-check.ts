import { hashPassword } from "../src/lib/crypto";
import { login } from "../src/lib/auth";
import { db, run } from "../src/lib/db";
import { cancelTask, closeTask, createTask, openTaskCount, submitTask, suspendEmployee } from "../src/lib/tasks";
import { periodContaining } from "../src/lib/time";

let passed = 0;
let total = 0;
function check(name: string, ok: boolean, detail: string) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  if (!ok) process.exitCode = 1;
}

const supervisor = login("supervisor@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "task-check" });
const tech = login("devabulaziz@outlook.com", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "task-check" });
const guard = login("guard@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "task-check" });
if (!("user" in supervisor) || !("user" in tech) || !("user" in guard) || !guard.user.companyId || !guard.user.siteId) {
  throw new Error("seed login failed");
}

const tempId = crypto.randomUUID();
const tempEmail = `temp.${tempId.slice(0, 8)}@kafaaops.local`;
run(
  `INSERT INTO users (id, company_id, email, name_ar, name_en, password_hash, role, status, employee_no, manager_id, shift_no, site_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?, 'GUARD', 'ACTIVE', ?, ?, 1, ?, ?)`,
  tempId,
  guard.user.companyId,
  tempEmail,
  "حارس مؤقت",
  "Temporary guard",
  hashPassword("Kafaa.Ops#2026"),
  "G-TMP",
  supervisor.user.id,
  guard.user.siteId,
  new Date().toISOString(),
);

const temp = login(tempEmail, "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "task-check" });
if (!("user" in temp)) throw new Error("temp login failed");
const duty = periodContaining().end;
const created = createTask(supervisor.user, { guardId: temp.user.id, siteId: guard.user.siteId, dutyDate: duty });
check("supervisor assigns his guard", "id" in created, "error" in created ? created.error : created.id);
const outsider = createTask(guard.user, { guardId: temp.user.id, siteId: guard.user.siteId, dutyDate: duty });
check("guard cannot assign a task", "error" in outsider, "error" in outsider ? outsider.error : "created");

if ("id" in created) {
  const blocked = suspendEmployee(tech.user, temp.user.id);
  check("open task blocks suspension", "error" in blocked && blocked.error === "err_open_task", "error" in blocked ? blocked.error : "suspended");
  const submitted = submitTask(temp.user, created.id);
  check("guard submits his task", "status" in submitted, "error" in submitted ? submitted.error : submitted.status);
  const stillBlocked = suspendEmployee(tech.user, temp.user.id);
  check("submitted task still blocks suspension", "error" in stillBlocked && stillBlocked.error === "err_open_task", "error" in stillBlocked ? stillBlocked.error : "suspended");
  const closed = closeTask(supervisor.user, created.id, 4, "تمت");
  check("supervisor closes the submitted task", "status" in closed, "error" in closed ? closed.error : closed.status);
  check("closed task is not open", openTaskCount(temp.user.id) === 0, String(openTaskCount(temp.user.id)));
  const suspended = suspendEmployee(tech.user, temp.user.id);
  check("suspension works after the task closes", "status" in suspended, "error" in suspended ? suspended.error : suspended.status);
}

const stray = createTask(supervisor.user, { guardId: guard.user.id, siteId: guard.user.siteId, dutyDate: duty });
if ("id" in stray) {
  const cancelled = cancelTask(supervisor.user, stray.id);
  check("supervisor can cancel an open task", "status" in cancelled, "error" in cancelled ? cancelled.error : cancelled.status);
  check("cancelled task does not block the seed guard", openTaskCount(guard.user.id) === 0, String(openTaskCount(guard.user.id)));
}

db().prepare("DELETE FROM tasks WHERE guard_id = ?").run(tempId);
db().prepare("DELETE FROM users WHERE id = ?").run(tempId);
console.log(`${passed}/${total} task checks passed`);
