import { movement, markDay, parseScheduleCsv, saveSchedule } from "../src/lib/payroll";
import { login } from "../src/lib/auth";
import { one } from "../src/lib/db";

let passed = 0;
let total = 0;
function check(name: string, ok: boolean, detail: string) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  if (!ok) process.exitCode = 1;
}

const now = new Date("2026-11-05T02:14:00.000Z");
check(
  "rest is not absence",
  markDay({ schedule: "REST", onLeave: false, punchAt: null, shift: { start: 420, end: 900, grace: 15 }, date: "2026-11-06", now }) === "REST",
  "REST",
);
check(
  "approved leave beats a missed duty",
  markDay({ schedule: "DUTY", onLeave: true, punchAt: null, shift: { start: 420, end: 900, grace: 15 }, date: "2026-11-01", now }) === "LEAVE",
  "LEAVE",
);
check(
  "closed duty without a punch is absence",
  markDay({ schedule: "DUTY", onLeave: false, punchAt: null, shift: { start: 420, end: 900, grace: 15 }, date: "2026-11-01", now }) === "ABSENT",
  "ABSENT",
);
check(
  "open shift is not absence yet",
  markDay({ schedule: "DUTY", onLeave: false, punchAt: null, shift: { start: 420, end: 900, grace: 15 }, date: "2026-11-05", now }) === "OPEN",
  "OPEN",
);
check(
  "arrival inside grace is present",
  markDay({ schedule: "DUTY", onLeave: false, punchAt: "2026-11-01T04:10:00.000Z", shift: { start: 420, end: 900, grace: 15 }, date: "2026-11-01", now }) === "PRESENT",
  "PRESENT",
);
check(
  "arrival after grace is late",
  markDay({ schedule: "DUTY", onLeave: false, punchAt: "2026-11-01T04:50:00.000Z", shift: { start: 420, end: 900, grace: 15 }, date: "2026-11-01", now }) === "LATE",
  "LATE",
);

const parsed = parseScheduleCsv("date,kind\n2026-10-21,DUTY\n=cmd,'oops'\n2026-10-24,راحة\n");
check("csv keeps duty and rest", parsed.some((row) => row.date === "2026-10-21" && row.kind === "DUTY") && parsed.some((row) => row.date === "2026-10-24" && row.kind === "REST"), JSON.stringify(parsed));
check("csv drops a formula line", parsed.every((row) => !row.date.startsWith("=")), parsed.map((row) => row.date).join(","));

const hr = login("hr@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "payroll-check" });
const guard = login("guard@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "payroll-check" });
if (!("user" in hr) || !("user" in guard) || !guard.user.companyId) throw new Error("seed login failed");
const denied = saveSchedule(hr.user, guard.user.id, [{ date: "2026-11-01", kind: "REST" }]);
check("hr cannot rewrite the roster", "error" in denied, "error" in denied ? denied.error : "saved");

const supervisor = login("supervisor@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "payroll-check" });
if (!("user" in supervisor)) throw new Error("supervisor login failed");
const other = one<{ id: string }>("SELECT id FROM users WHERE company_id = ? AND role = 'GUARD' AND manager_id != ? LIMIT 1", guard.user.companyId, supervisor.user.id);
if (other) {
  const outside = saveSchedule(supervisor.user, other.id, [{ date: "2026-11-02", kind: "REST" }]);
  check("supervisor cannot edit another team", "error" in outside, "error" in outside ? outside.error : "saved");
}

const sheet = movement(guard.user.companyId, now);
const fridays = sheet.dates.filter((date) => new Date(`${date}T12:00:00+03:00`).getUTCDay() === 5);
const guardRow = sheet.rows.find((row) => row.id === guard.user.id);
check(
  "seed fridays stay rest on the sheet",
  Boolean(guardRow) && fridays.every((date) => guardRow?.days[date]?.mark === "REST"),
  fridays.map((date) => guardRow?.days[date]?.mark).join(","),
);
check("sheet period is 21 to 20", sheet.period.start.endsWith("-21") && sheet.period.end.endsWith("-20"), `${sheet.period.start} ${sheet.period.end}`);

console.log(`${passed}/${total} payroll checks passed`);
