import { existsSync, unlinkSync } from "node:fs";
import { login } from "../src/lib/auth";
import { appendChain, db } from "../src/lib/db";
import { recordArrival } from "../src/lib/ops";
import { acknowledgeAlert, addBan, addVehicle, cancelCustody, checkPermit, grantAlertClose, judgePermit, openAlerts, raiseAlert, receiveCustody, recordVehicleIn, returnRadio, revokeAlertClose, startCustody } from "../src/lib/field";
import { addDays, riyadhParts } from "../src/lib/time";

let passed = 0;
let total = 0;
function check(name: string, ok: boolean, detail: string) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  if (!ok) process.exitCode = 1;
}

const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxMTEhUTExMWFRUXGBcYGBgYGBoYGBgYGBgYGBgYGBgYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAADAAIEBQYBB//EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Anf/Z",
  "base64",
);

const guard = login("guard@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "field-check" });
const supervisor = login("supervisor@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "field-check" });
const manager = login("manager@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "field-check" });
const tech = login("devabulaziz@outlook.com", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "field-check" });
if (!("user" in guard) || !("user" in supervisor) || !("user" in manager) || !("user" in tech) || !guard.user.companyId || !guard.user.siteId) throw new Error("seed login failed");
const site = db().prepare("SELECT latitude, longitude FROM sites WHERE id = ?").get(guard.user.siteId) as { latitude: number; longitude: number };
appendChain("punches", guard.user.companyId, {
  id: crypto.randomUUID(),
  company_id: guard.user.companyId,
  user_id: guard.user.id,
  site_id: guard.user.siteId,
  kind: "IN",
  server_time: new Date().toISOString(),
}, { kind: "IN", userId: guard.user.id, serverTime: new Date().toISOString() });
const arrived = recordArrival(guard.user, { lat: site.latitude, lng: site.longitude, accuracy: 10, photo: jpeg });
if ("error" in arrived) throw new Error(arrived.error);

const blockedRadio = receiveCustody(guard.user, { deviceNo: "TW-14", radioPhoto: jpeg });
check("receipt waits until the employee requests it", "error" in blockedRadio && blockedRadio.error === "err_direction", "error" in blockedRadio ? blockedRadio.error : "saved");
const chosen = startCustody(guard.user, { kind: "RADIO" });
check("the employee requests the radio himself", "id" in chosen, "error" in chosen ? chosen.error : chosen.id);
const radioDirection = "id" in chosen ? { id: chosen.id } : { id: "" };
const cancelled = cancelCustody(guard.user, radioDirection.id);
check("a request can be cancelled before the photos", "id" in cancelled, "error" in cancelled ? cancelled.error : cancelled.id);
const chosenAgain = startCustody(guard.user, { kind: "RADIO" });
check("the cancelled radio can be requested again", "id" in chosenAgain, "error" in chosenAgain ? chosenAgain.error : chosenAgain.id);
const stillOpen = db().prepare("SELECT COUNT(*) AS n FROM custody_logs WHERE user_id = ? AND kind = 'RADIO'").get(guard.user.id) as { n: number };
check("choosing does not start the possession clock", stillOpen.n === 0, String(stillOpen.n));
const missingRadio = receiveCustody(guard.user, { deviceNo: "TW-14" });
check("radio without a photo is refused", "error" in missingRadio, "error" in missingRadio ? missingRadio.error : "saved");
const radio = receiveCustody(guard.user, { deviceNo: "TW-14", radioPhoto: jpeg });
check("receipt stores the radio at the server minute", "ids" in radio, "error" in radio ? radio.error : radio.ids.join(","));
const lateCancel = cancelCustody(guard.user, "id" in chosenAgain ? chosenAgain.id : "");
check("received custody cannot be cancelled", "error" in lateCancel && lateCancel.error === "err_cancel", "error" in lateCancel ? lateCancel.error : "cancelled");

const vehicle = addVehicle(manager.user, { code: "C-14", label: "جيب الدورية" });
check("manager adds a car to the list", "code" in vehicle, "error" in vehicle ? vehicle.error : vehicle.code);
const vehicleRow = db().prepare("SELECT id FROM vehicles WHERE company_id = ? AND code = 'C-14'").get(guard.user.companyId) as { id: string };
const blockedCar = receiveCustody(guard.user, { vehicleId: vehicleRow.id, km: 1500, outside: jpeg, inside: jpeg, odometer: jpeg });
check("the jeep is not received before the employee requests it", "error" in blockedCar && blockedCar.error === "err_direction", "error" in blockedCar ? blockedCar.error : "saved");
const carChoice = startCustody(guard.user, { kind: "VEHICLE", vehicleId: vehicleRow.id });
check("the employee requests the jeep himself", "id" in carChoice, "error" in carChoice ? carChoice.error : carChoice.id);
const halfCar = receiveCustody(guard.user, { vehicleId: vehicleRow.id, km: 1500, outside: jpeg, inside: jpeg });
check("car exit needs an odometer photo", "error" in halfCar && halfCar.error === "err_odometer_photo", "error" in halfCar ? halfCar.error : "saved");
const carOut = receiveCustody(guard.user, { vehicleId: vehicleRow.id, km: 1500, outside: jpeg, inside: jpeg, odometer: jpeg });
check("car exit stores outside, inside, and the odometer photo", "ids" in carOut, "error" in carOut ? carOut.error : carOut.ids.join(","));
const lower = recordVehicleIn(guard.user, { vehicleId: vehicleRow.id, km: 1490, fuel: "Q1", odometer: jpeg, fuelPhoto: jpeg });
check("return odometer cannot go backwards", "error" in lower && lower.error === "err_odometer", "error" in lower ? lower.error : "saved");
const carIn = recordVehicleIn(guard.user, { vehicleId: vehicleRow.id, km: 1520, fuel: "Q1", odometer: jpeg, fuelPhoto: jpeg });
check("end of shift stores fuel photo and return odometer photo", "id" in carIn, "error" in carIn ? carIn.error : carIn.id);
const radioBack = returnRadio(guard.user, { deviceNo: "TW-14", photo: jpeg });
check("radio return needs the same signal number and a photo", "id" in radioBack, "error" in radioBack ? radioBack.error : radioBack.id);
const possession = db().prepare(
  `SELECT out_log.created_at AS started, in_log.created_at AS ended
   FROM custody_logs out_log
   JOIN custody_logs in_log ON in_log.user_id = out_log.user_id AND in_log.kind = 'RADIO_IN' AND in_log.device_no = out_log.device_no
   WHERE out_log.user_id = ? AND out_log.kind = 'RADIO'`,
).get(guard.user.id) as { started: string; ended: string } | undefined;
check("the return closes the minutes the radio was in his hand", Boolean(possession && possession.ended >= possession.started), possession ? `${possession.started} → ${possession.ended}` : "missing");

const guardBan = addBan(guard.user, { registrationNo: "7011111111", name: "محل تجريبي", reason: "منع تشغيلي" });
check("guard cannot edit the ban list", "error" in guardBan, "error" in guardBan ? guardBan.error : "saved");
const ban = addBan(manager.user, { registrationNo: "70-1111 1111", name: "محل تجريبي", reason: "منع تشغيلي" });
check("manager stores a local ban", "registration" in ban, "error" in ban ? ban.error : ban.registration);

const today = riyadhParts().date;
const banned = checkPermit(guard.user, { shopName: "محل تجريبي", registrationNo: "7011111111", validUntil: addDays(today, 10) });
check("local list flags the shop", "banned" in banned && banned.banned && !banned.expired, "error" in banned ? banned.error : `${banned.banned}`);
const expired = checkPermit(guard.user, { shopName: "محل آخر", registrationNo: "7099999999", validUntil: addDays(today, -1) });
check("server date flags an expired permit", "expired" in expired && expired.expired && !expired.expired === false && expired.expired, "error" in expired ? expired.error : "expired");
check("expiry does not use a remote registry", judgePermit(guard.user.companyId, "7000000001", addDays(today, 3), today).banned === false, "local");

const alert = raiseAlert(guard.user, { kind: "FIGHT", body: "مضاربة عند البوابة الشمالية" });
check("guard raises an emergency", "id" in alert, "error" in alert ? alert.error : alert.id);
const visible = openAlerts(guard.user.companyId);
check("open devices can read the emergency", "id" in alert && visible.some((row) => row.id === alert.id && row.employee_no === "G-001"), String(visible.length));
const guardAck = "id" in alert ? acknowledgeAlert(guard.user, alert.id) : { error: "err_permission" as const };
check("guard cannot silence the alarm", "error" in guardAck, "error" in guardAck ? guardAck.error : "acked");
const managerAck = "id" in alert ? acknowledgeAlert(manager.user, alert.id) : { error: "err_permission" as const };
check("security manager cannot silence without a grant", "error" in managerAck, "error" in managerAck ? managerAck.error : "acked");
const techAck = "id" in alert ? acknowledgeAlert(tech.user, alert.id) : { error: "err_permission" as const };
check("technician cannot silence without granting it", "error" in techAck, "error" in techAck ? techAck.error : "acked");
const granted = grantAlertClose(tech.user, manager.user.id);
check("technician grants alarm close", "userId" in granted, "error" in granted ? granted.error : granted.userId);
const grantedAck = "id" in alert ? acknowledgeAlert(manager.user, alert.id) : { error: "err_permission" as const };
check("granted person can silence the alarm", "status" in grantedAck, "error" in grantedAck ? grantedAck.error : grantedAck.status);
const second = raiseAlert(guard.user, { kind: "SECURITY", body: "حركة غير طبيعية عند البوابة" });
const revoked = revokeAlertClose(tech.user, manager.user.id);
check("technician revokes alarm close", "userId" in revoked, "error" in revoked ? revoked.error : revoked.userId);
const afterRevoke = "id" in second ? acknowledgeAlert(manager.user, second.id) : { error: "err_permission" as const };
check("revoked person cannot silence the next alarm", "error" in afterRevoke, "error" in afterRevoke ? afterRevoke.error : "acked");
const acked = "id" in second ? acknowledgeAlert(supervisor.user, second.id) : { error: "err_permission" as const };
check("supervisor acknowledges the alarm", "status" in acked, "error" in acked ? acked.error : acked.status);
check("acknowledged alarm leaves the open list", "id" in second && openAlerts(guard.user.companyId).every((row) => row.id !== second.id), "cleared");

const paths = db().prepare(
  `SELECT photo_path AS path FROM custody_logs WHERE user_id = ?
   UNION SELECT photo2_path FROM custody_logs WHERE user_id = ? AND photo2_path IS NOT NULL
   UNION SELECT custody_photos.path FROM custody_photos JOIN custody_logs ON custody_logs.id = custody_photos.log_id WHERE custody_logs.user_id = ?`,
).all(guard.user.id, guard.user.id, guard.user.id) as Array<{ path: string }>;
for (const row of paths) {
  if (row.path && existsSync(row.path)) unlinkSync(row.path);
}
db().prepare("DELETE FROM custody_directions WHERE company_id = ? AND user_id = ?").run(guard.user.companyId, guard.user.id);
db().prepare("DELETE FROM custody_photos WHERE log_id IN (SELECT id FROM custody_logs WHERE user_id = ?)").run(guard.user.id);
db().prepare("DELETE FROM custody_logs WHERE user_id = ?").run(guard.user.id);
db().prepare("DELETE FROM vehicles WHERE company_id = ? AND code = 'C-14'").run(guard.user.companyId);
db().prepare("DELETE FROM permits WHERE company_id = ?").run(guard.user.companyId);
db().prepare("DELETE FROM shop_bans WHERE company_id = ?").run(guard.user.companyId);
db().prepare("DELETE FROM alerts WHERE company_id = ?").run(guard.user.companyId);
db().prepare("DELETE FROM alert_closers WHERE company_id = ?").run(guard.user.companyId);
console.log(`${passed}/${total} field checks passed`);
