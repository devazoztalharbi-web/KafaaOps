import { login } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { addPoint, directPerson, todayPosting } from "../src/lib/posts";

let passed = 0;
let total = 0;
function check(name: string, ok: boolean, detail: string) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  if (!ok) process.exitCode = 1;
}

const guard = login("guard@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "posts-check" });
const supervisor = login("supervisor@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "posts-check" });
const manager = login("manager@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "posts-check" });
if (!("user" in guard) || !("user" in supervisor) || !("user" in manager) || !guard.user.companyId || !guard.user.siteId) throw new Error("seed login failed");

const denied = addPoint(guard.user, guard.user.siteId, "زون 1");
check("guard cannot add a place name", "error" in denied, "error" in denied ? denied.error : "added");
const zone = addPoint(manager.user, guard.user.siteId, "زون 1");
const scene = addPoint(manager.user, guard.user.siteId, "سين 2");
check("manager adds zone and scene names", "id" in zone && "id" in scene, "error" in zone ? zone.error : "added");
const duplicate = addPoint(manager.user, guard.user.siteId, "زون 1");
check("the same shortcut is not added twice", "error" in duplicate, "error" in duplicate ? duplicate.error : "added");

const outsider = directPerson(guard.user, guard.user.id, "id" in zone ? zone.id : "");
check("guard cannot direct himself", "error" in outsider, "error" in outsider ? outsider.error : "directed");
const directed = directPerson(supervisor.user, guard.user.id, "id" in zone ? zone.id : "");
check("supervisor directs his guard at shift start", "dutyDate" in directed, "error" in directed ? directed.error : directed.dutyDate);
const posting = todayPosting(guard.user.companyId, guard.user.id);
check("guard sees the chosen shortcut", posting?.label === "زون 1", posting?.label ?? "none");
const moved = directPerson(supervisor.user, guard.user.id, "id" in scene ? scene.id : "");
const updated = todayPosting(guard.user.companyId, guard.user.id);
check("a new direction replaces today's post", "dutyDate" in moved && updated?.label === "سين 2", updated?.label ?? "none");

db().prepare("DELETE FROM postings WHERE user_id = ?").run(guard.user.id);
db().prepare("DELETE FROM site_points WHERE company_id = ? AND label IN ('زون 1', 'سين 2')").run(guard.user.companyId);
console.log(`${passed}/${total} posting checks passed`);
