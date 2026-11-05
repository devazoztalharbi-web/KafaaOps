import { appendChain, db } from "../src/lib/db";
import { login, sessionUser } from "../src/lib/auth";
import { checkGeofence, createLeave, decideLeave, leaveState, recordPunch } from "../src/lib/ops";
import { assertUpload } from "../src/lib/files";
import { one } from "../src/lib/db";

const results: Array<{ name: string; blocked: boolean; detail: string }> = [];

function check(name: string, blocked: boolean, detail: string) {
  results.push({ name, blocked, detail });
  console.log(`${blocked ? "BLOCKED" : "OPEN   "}  ${name}  ${detail}`);
}

const guardLogin = login("guard@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "attack" });
const supervisorLogin = login("supervisor@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "attack" });
const managerLogin = login("manager@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "attack" });
if (!("user" in guardLogin) || !("user" in supervisorLogin) || !("user" in managerLogin)) {
  throw new Error("seed login failed");
}
const guard = guardLogin.user;
const supervisor = supervisorLogin.user;
const manager = managerLogin.user;
const companyId = guard.companyId!;
const site = one<{ id: string }>("SELECT id FROM sites WHERE company_id = ? AND kind = 'SITE' LIMIT 1", companyId);
if (!site) throw new Error("no site");

const injected = login("' OR 1=1 --", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "attack" });
check("sql injection login", "error" in injected, "error" in injected ? injected.error : "logged in");

const forged = sessionUser("forged-token");
check("forged session", forged === null, forged ? forged.email : "rejected");

const wrong = login("guard@kafaaops.local", "wrong-password", { ip: "127.0.0.1", userAgent: "attack" });
check("wrong password", "error" in wrong, "error" in wrong ? wrong.error : "accepted");

try {
  assertUpload(Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]));
  check("executable upload", false, "accepted");
} catch (error) {
  check("executable upload", true, error instanceof Error ? error.message : "rejected");
}

try {
  assertUpload(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from("<script>alert(1)</script>")]));
  check("jpeg with script", false, "accepted");
} catch (error) {
  check("jpeg with script", true, error instanceof Error ? error.message : "rejected");
}

const outside = checkGeofence(companyId, site.id, 21.4, 39.2, 20);
check("geofence jeddah vs riyadh", "error" in outside, "error" in outside ? outside.error : "inside");

const sloppy = checkGeofence(companyId, site.id, 24.711, 46.675, 5000);
check("coarse location", "error" in sloppy, "error" in sloppy ? sloppy.error : "accepted");

const phonePunch = recordPunch(guard, {
  siteId: site.id,
  kind: "IN",
  lat: 24.711,
  lng: 46.675,
  accuracy: 20,
  clientTime: "2000-01-01T00:00:00.000Z",
  userAgent: "Mozilla/5.0 (Linux; Android 14)",
  integrity: null,
  imageSha: "abc",
});
check("android punch without app integrity", "error" in phonePunch, "error" in phonePunch ? phonePunch.error : "accepted");

const devPunch = recordPunch(guard, {
  siteId: site.id,
  kind: "IN",
  lat: 24.711,
  lng: 46.675,
  accuracy: 20,
  userAgent: "Mozilla/5.0 (Linux; Android 14)",
  integrity: {
    platform: "android",
    developerOptions: true,
    adbEnabled: false,
    mockLocation: false,
    simulatedLocation: false,
    checkedAt: new Date().toISOString(),
  },
  imageSha: "def",
});
check("developer options", "error" in devPunch, "error" in devPunch ? devPunch.error : "accepted");

const own = createLeave(guard, { type: "ANNUAL", start: "2026-12-01", end: "2026-12-02", reason: "test" });
if (!("id" in own)) throw new Error("leave create failed");
const selfApprove = decideLeave(guard, own.id, "APPROVE", "myself");
check("guard approves own leave", "error" in selfApprove, "error" in selfApprove ? selfApprove.error : leaveState(own.id));

const hrLogin = login("hr@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "attack" });
if (!("user" in hrLogin)) throw new Error("hr login failed");
const hrDecide = decideLeave(hrLogin.user, own.id, "APPROVE", "skip chain");
check("hr skips approval chain", "error" in hrDecide, "error" in hrDecide ? hrDecide.error : leaveState(own.id));

const supervisorOk = decideLeave(supervisor, own.id, "APPROVE", "ok");
check("supervisor of this guard", !("error" in supervisorOk), "error" in supervisorOk ? supervisorOk.error : leaveState(own.id));
const finalOk = decideLeave(manager, own.id, "APPROVE", "final");
check("security manager final", !("error" in finalOk) && leaveState(own.id) === "APPROVED", leaveState(own.id));

const desktopPunch = recordPunch(guard, {
  siteId: site.id,
  kind: "IN",
  lat: 24.711,
  lng: 46.675,
  accuracy: 20,
  clientTime: "1999-01-01T00:00:00.000Z",
  userAgent: "Mozilla/5.0 (Windows NT 10.0)",
  integrity: null,
  imageSha: "desktop-image-sha-not-reused",
  faceProof: "forged-proof",
});
check("punch without a server face match", "error" in desktopPunch, "error" in desktopPunch ? desktopPunch.error : desktopPunch.serverTime);

appendChain(
  "punches",
  companyId,
  {
    id: crypto.randomUUID(),
    company_id: companyId,
    user_id: guard.id,
    site_id: site.id,
    kind: "IN",
    server_time: new Date().toISOString(),
  },
  { reason: "ledger fixture" },
);

const database = db();
let updateBlocked = false;
try {
  database.prepare("UPDATE punches SET hmac = 'tamper' WHERE company_id = ?").run(companyId);
} catch {
  updateBlocked = true;
}
check("update punch ledger", updateBlocked, updateBlocked ? "trigger aborted" : "row changed");

database.exec("BEGIN");
let deleteBlocked = false;
try {
  database.prepare("DELETE FROM audit_events WHERE company_id = ?").run(companyId);
} catch {
  deleteBlocked = true;
}
database.exec("ROLLBACK");
check("delete audit ledger", deleteBlocked, deleteBlocked ? "trigger aborted" : "rows deleted");

const sick = createLeave(guard, { type: "SICK", start: "2026-12-03", end: "2026-12-03", reason: "ill" });
check("sick leave without file", "error" in sick, "error" in sick ? sick.error : "accepted");

const open = results.filter((item) => !item.blocked);
console.log(`\n${results.length - open.length}/${results.length} attacks blocked`);
if (open.length) {
  console.log(open.map((item) => item.name).join(", "));
  process.exitCode = 1;
}
