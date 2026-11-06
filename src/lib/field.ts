import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { audit, db, many, one, run } from "./db";
import { dataDir, encrypt, sha256 } from "./crypto";
import { assertUpload } from "./files";
import { todayArrival } from "./ops";
import { riyadhParts } from "./time";
import type { SessionUser } from "./auth";

const FUEL = ["E", "Q1", "HALF", "Q3", "F"] as const;
type Fuel = (typeof FUEL)[number];

function storePhoto(bytes: Uint8Array) {
  const kind = assertUpload(bytes);
  if (kind === "pdf") throw new Error("err_file_type");
  const id = crypto.randomUUID();
  const target = path.join(dataDir, "files", `${id}.bin`);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, encrypt(Buffer.from(bytes)));
  return { path: target, sha: sha256(Buffer.from(bytes)) };
}

function photoBytesOk(value: Uint8Array | undefined) {
  if (!value) return false;
  try {
    return assertUpload(value) !== "pdf";
  } catch {
    return false;
  }
}

function readPhoto(value: Uint8Array | undefined) {
  if (!value) return { error: "err_file_type" as const };
  try {
    return storePhoto(value);
  } catch {
    return { error: "err_file_type" as const };
  }
}

export function normalizeRegistration(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

function fieldStaff(actor: SessionUser) {
  return Boolean(actor.companyId && (actor.role === "GUARD" || actor.role === "SUPERVISOR"));
}

function saveLogPhoto(logId: string, slot: string, photo: { sha: string; path: string }) {
  run("INSERT INTO custody_photos (id, log_id, slot, sha, path) VALUES (?, ?, ?, ?, ?)", crypto.randomUUID(), logId, slot, photo.sha, photo.path);
}

export function recordRadio(actor: SessionUser, input: { deviceNo: string; photo?: Uint8Array }) {
  if (!fieldStaff(actor) || !actor.companyId) return { error: "err_permission" as const };
  const radioDirection = directed(actor, "RADIO");
  if (fieldStaff(actor) && radioDirection?.status !== "REQUESTED") return { error: "err_direction" as const };
  const deviceNo = input.deviceNo.trim();
  if (deviceNo.length < 1 || deviceNo.length > 32 || /[\r\n]/.test(deviceNo)) return { error: "err_device" as const };
  const photo = readPhoto(input.photo);
  if ("error" in photo) return photo;
  const id = crypto.randomUUID();
  run(
    `INSERT INTO custody_logs
     (id, company_id, user_id, kind, device_no, odometer_km, fuel_level, photo_sha, photo_path, photo2_sha, photo2_path, created_at)
     VALUES (?, ?, ?, 'RADIO', ?, NULL, NULL, ?, ?, NULL, NULL, ?)`,
    id,
    actor.companyId,
    actor.id,
    deviceNo,
    photo.sha,
    photo.path,
    new Date().toISOString(),
  );
  saveLogPhoto(id, "DEVICE", photo);
  if (radioDirection) run("UPDATE custody_directions SET status = 'RECEIVED' WHERE id = ?", radioDirection.id);
  audit(actor.companyId, actor.id, "custody.radio", "custody", id, { deviceNo, photoSha: photo.sha });
  return { id };
}

export function returnRadio(actor: SessionUser, input: { deviceNo: string; photo?: Uint8Array }) {
  if (!fieldStaff(actor) || !actor.companyId) return { error: "err_permission" as const };
  const deviceNo = input.deviceNo.trim();
  const taken = one<{ id: string }>(
    "SELECT id FROM custody_logs WHERE company_id = ? AND user_id = ? AND kind = 'RADIO' AND device_no = ? ORDER BY created_at DESC LIMIT 1",
    actor.companyId,
    actor.id,
    deviceNo,
  );
  if (!taken || deviceNo.length < 1) return { error: "err_device" as const };
  const photo = readPhoto(input.photo);
  if ("error" in photo) return photo;
  const id = crypto.randomUUID();
  run(
    `INSERT INTO custody_logs
     (id, company_id, user_id, kind, device_no, odometer_km, fuel_level, photo_sha, photo_path, photo2_sha, photo2_path, created_at)
     VALUES (?, ?, ?, 'RADIO_IN', ?, NULL, NULL, ?, ?, NULL, NULL, ?)`,
    id,
    actor.companyId,
    actor.id,
    deviceNo,
    photo.sha,
    photo.path,
    new Date().toISOString(),
  );
  saveLogPhoto(id, "DEVICE", photo);
  const radioDirection = directed(actor, "RADIO");
  if (radioDirection?.status === "RECEIVED") run("UPDATE custody_directions SET status = 'RETURNED' WHERE id = ?", radioDirection.id);
  audit(actor.companyId, actor.id, "custody.radio.return", "custody", id, { deviceNo, photoSha: photo.sha });
  return { id };
}

export function addVehicle(actor: SessionUser, input: { code: string; label: string }) {
  if (!actor.companyId || (actor.role !== "TECH_ADMIN" && actor.role !== "SECURITY_MANAGER")) return { error: "err_permission" as const };
  const code = input.code.trim();
  const label = input.label.trim();
  if (code.length < 1 || code.length > 20 || label.length < 1) return { error: "err_vehicle" as const };
  const id = crypto.randomUUID();
  run(
    `INSERT INTO vehicles (id, company_id, code, label, active) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(company_id, code) DO UPDATE SET label = excluded.label, active = 1`,
    id,
    actor.companyId,
    code,
    label.slice(0, 80),
  );
  audit(actor.companyId, actor.id, "vehicle.add", "vehicle", code, { label });
  return { code };
}

export function listVehicles(companyId: string) {
  return many<{ id: string; code: string; label: string }>("SELECT id, code, label FROM vehicles WHERE company_id = ? AND active = 1 ORDER BY code", companyId);
}

function vehicleBusy(companyId: string, vehicleId: string, exceptUserId: string) {
  const held = one<{ user_id: string; kind: string }>(
    "SELECT user_id, kind FROM custody_logs WHERE company_id = ? AND vehicle_id = ? ORDER BY created_at DESC LIMIT 1",
    companyId,
    vehicleId,
  );
  if (held?.kind === "VEHICLE_OUT" && held.user_id !== exceptUserId) return true;
  const reserved = one<{ user_id: string }>(
    "SELECT user_id FROM custody_directions WHERE company_id = ? AND vehicle_id = ? AND duty_date = ? AND status IN ('REQUESTED', 'RECEIVED') AND user_id <> ?",
    companyId,
    vehicleId,
    riyadhParts().date,
    exceptUserId,
  );
  return Boolean(reserved);
}

export function availableCustody(actor: SessionUser) {
  if (!actor.companyId || !fieldStaff(actor)) return { radio: false, vehicles: [] as Array<{ id: string; code: string; label: string }> };
  const radio = directed(actor, "RADIO");
  const ownVehicle = directed(actor, "VEHICLE");
  const holdingVehicle = ownVehicle?.status === "REQUESTED" || ownVehicle?.status === "RECEIVED";
  return {
    radio: !radio || (radio.status !== "REQUESTED" && radio.status !== "RECEIVED"),
    vehicles: holdingVehicle ? [] : listVehicles(actor.companyId).filter((vehicle) => !vehicleBusy(actor.companyId ?? "", vehicle.id, actor.id)),
  };
}

export function startCustody(actor: SessionUser, input: { kind: "RADIO" | "VEHICLE"; vehicleId?: string }) {
  if (!fieldStaff(actor) || !actor.companyId) return { error: "err_permission" as const };
  if (!todayArrival(actor.companyId, actor.id)) return { error: "err_arrival" as const };
  const existing = directed(actor, input.kind);
  if (existing?.status === "REQUESTED" || existing?.status === "RECEIVED") return { error: "err_direction" as const };
  let vehicleId: string | null = null;
  if (input.kind === "VEHICLE") {
    const vehicle = one<{ id: string }>("SELECT id FROM vehicles WHERE id = ? AND company_id = ? AND active = 1", input.vehicleId ?? "", actor.companyId);
    if (!vehicle) return { error: "err_vehicle" as const };
    if (vehicleBusy(actor.companyId, vehicle.id, actor.id)) return { error: "err_vehicle" as const };
    vehicleId = vehicle.id;
  }
  const row = one<{ id: string }>(
    `INSERT INTO custody_directions (id, company_id, user_id, duty_date, kind, vehicle_id, note, status, assigned_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'طلب', 'REQUESTED', ?, ?)
     ON CONFLICT(company_id, user_id, duty_date, kind) DO UPDATE SET
       vehicle_id = excluded.vehicle_id, status = 'REQUESTED', assigned_by = excluded.assigned_by, created_at = excluded.created_at
     RETURNING id`,
    crypto.randomUUID(),
    actor.companyId,
    actor.id,
    riyadhParts().date,
    input.kind,
    vehicleId,
    actor.id,
    new Date().toISOString(),
  );
  if (!row) return { error: "err_direction" as const };
  audit(actor.companyId, actor.id, "custody.request", "user", actor.id, { kind: input.kind, vehicleId });
  return { id: row.id };
}

export function todayDirections(actor: SessionUser) {
  if (!actor.companyId || (actor.role !== "GUARD" && actor.role !== "SUPERVISOR")) return [];
  return many<{ id: string; kind: string; status: string; vehicle_id: string | null; note: string; code: string | null; label: string | null }>(
    `SELECT custody_directions.id, custody_directions.kind, custody_directions.status, custody_directions.vehicle_id, custody_directions.note, vehicles.code, vehicles.label
     FROM custody_directions
     LEFT JOIN vehicles ON vehicles.id = custody_directions.vehicle_id
     WHERE custody_directions.company_id = ? AND custody_directions.user_id = ? AND custody_directions.duty_date = ?`,
    actor.companyId,
    actor.id,
    riyadhParts().date,
  );
}

function directed(actor: SessionUser, kind: "RADIO" | "VEHICLE") {
  if (!actor.companyId) return undefined;
  return one<{ id: string; status: string; vehicle_id: string | null }>(
    "SELECT id, status, vehicle_id FROM custody_directions WHERE company_id = ? AND user_id = ? AND duty_date = ? AND kind = ?",
    actor.companyId,
    actor.id,
    riyadhParts().date,
    kind,
  );
}

function ownDirection(actor: SessionUser, directionId: string) {
  if (!actor.companyId) return undefined;
  return one<{ id: string; status: string }>(
    "SELECT id, status FROM custody_directions WHERE id = ? AND company_id = ? AND user_id = ? AND duty_date = ?",
    directionId,
    actor.companyId,
    actor.id,
    riyadhParts().date,
  );
}

export function cancelCustody(actor: SessionUser, directionId: string) {
  if (!fieldStaff(actor)) return { error: "err_permission" as const };
  const row = ownDirection(actor, directionId);
  if (!row) return { error: "err_direction" as const };
  if (row.status === "RECEIVED") return { error: "err_cancel" as const };
  if (row.status !== "REQUESTED") return { error: "err_direction" as const };
  run("DELETE FROM custody_directions WHERE id = ?", row.id);
  return { id: row.id };
}

function readFuel(value: string): Fuel | null {
  return FUEL.includes(value as Fuel) ? (value as Fuel) : null;
}

function readKm(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 2_000_000) return null;
  return value;
}

export function recordVehicleOut(actor: SessionUser, input: { vehicleId: string; km: number; outside?: Uint8Array; inside?: Uint8Array; odometer?: Uint8Array }) {
  if (!fieldStaff(actor) || !actor.companyId) return { error: "err_permission" as const };
  const km = readKm(input.km);
  if (km == null) return { error: "err_odometer" as const };
  const vehicle = one<{ id: string }>("SELECT id FROM vehicles WHERE id = ? AND company_id = ? AND active = 1", input.vehicleId, actor.companyId);
  if (!vehicle) return { error: "err_vehicle" as const };
  const direction = directed(actor, "VEHICLE");
  if (fieldStaff(actor) && (direction?.status !== "REQUESTED" || direction.vehicle_id !== vehicle.id)) return { error: "err_direction" as const };
  const outside = readPhoto(input.outside);
  const inside = readPhoto(input.inside);
  const odometer = readPhoto(input.odometer);
  if ("error" in outside) return outside;
  if ("error" in inside) return inside;
  if ("error" in odometer) return { error: "err_odometer_photo" as const };
  const id = crypto.randomUUID();
  run(
    `INSERT INTO custody_logs
     (id, company_id, user_id, kind, device_no, vehicle_id, odometer_km, fuel_level, photo_sha, photo_path, photo2_sha, photo2_path, created_at)
     VALUES (?, ?, ?, 'VEHICLE_OUT', NULL, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    id,
    actor.companyId,
    actor.id,
    vehicle.id,
    km,
    outside.sha,
    outside.path,
    inside.sha,
    inside.path,
    new Date().toISOString(),
  );
  saveLogPhoto(id, "EXTERIOR", outside);
  saveLogPhoto(id, "INTERIOR", inside);
  saveLogPhoto(id, "ODOMETER", odometer);
  if (direction) run("UPDATE custody_directions SET status = 'RECEIVED' WHERE id = ?", direction.id);
  audit(actor.companyId, actor.id, "custody.vehicle.out", "custody", id, { km, vehicleId: vehicle.id, odometerSha: odometer.sha });
  return { id };
}

export function receiveCustody(
  actor: SessionUser,
  input: { deviceNo?: string; radioPhoto?: Uint8Array; vehicleId?: string; km?: number; outside?: Uint8Array; inside?: Uint8Array; odometer?: Uint8Array },
) {
  if (!fieldStaff(actor) || !actor.companyId) return { error: "err_permission" as const };
  if (!todayArrival(actor.companyId, actor.id)) return { error: "err_arrival" as const };
  const radio = directed(actor, "RADIO");
  const vehicleDirection = directed(actor, "VEHICLE");
  const wantRadio = radio?.status === "REQUESTED";
  const wantVehicle = vehicleDirection?.status === "REQUESTED";
  if (!wantRadio && !wantVehicle) return { error: "err_direction" as const };
  const deviceNo = input.deviceNo?.trim() ?? "";
  if (wantRadio && (deviceNo.length < 1 || deviceNo.length > 32 || /[\r\n]/.test(deviceNo) || !photoBytesOk(input.radioPhoto))) {
    return { error: !photoBytesOk(input.radioPhoto) ? ("err_file_type" as const) : ("err_device" as const) };
  }
  const km = readKm(input.km ?? Number.NaN);
  if (wantVehicle && (km == null || input.vehicleId !== vehicleDirection?.vehicle_id)) return { error: "err_odometer" as const };
  if (wantVehicle && (!photoBytesOk(input.outside) || !photoBytesOk(input.inside))) return { error: "err_file_type" as const };
  if (wantVehicle && !photoBytesOk(input.odometer)) return { error: "err_odometer_photo" as const };
  const database = db();
  database.exec("BEGIN");
  try {
    const ids: string[] = [];
    if (wantRadio) {
      const saved = recordRadio(actor, { deviceNo, photo: input.radioPhoto });
      if ("error" in saved) throw saved;
      ids.push(saved.id);
    }
    if (wantVehicle && km != null) {
      const saved = recordVehicleOut(actor, { vehicleId: input.vehicleId ?? "", km, outside: input.outside, inside: input.inside, odometer: input.odometer });
      if ("error" in saved) throw saved;
      ids.push(saved.id);
    }
    database.exec("COMMIT");
    return { ids };
  } catch (error) {
    database.exec("ROLLBACK");
    if (error && typeof error === "object" && "error" in error) return error as { error: "err_direction" };
    return { error: "err_direction" as const };
  }
}

export function recordVehicleIn(actor: SessionUser, input: { vehicleId: string; km: number; fuel: string; odometer?: Uint8Array; fuelPhoto?: Uint8Array }) {
  if (!fieldStaff(actor) || !actor.companyId) return { error: "err_permission" as const };
  const km = readKm(input.km);
  const fuel = readFuel(input.fuel);
  if (km == null) return { error: "err_odometer" as const };
  if (!fuel) return { error: "err_fuel" as const };
  const previous = one<{ odometer_km: number }>(
    "SELECT odometer_km FROM custody_logs WHERE company_id = ? AND user_id = ? AND vehicle_id = ? AND kind = 'VEHICLE_OUT' ORDER BY created_at DESC LIMIT 1",
    actor.companyId,
    actor.id,
    input.vehicleId,
  );
  if (!previous || km < previous.odometer_km) return { error: "err_odometer" as const };
  const odometer = readPhoto(input.odometer);
  const fuelPhoto = readPhoto(input.fuelPhoto);
  if ("error" in odometer) return { error: "err_odometer_photo" as const };
  if ("error" in fuelPhoto) return { error: "err_fuel" as const };
  const id = crypto.randomUUID();
  run(
    `INSERT INTO custody_logs
     (id, company_id, user_id, kind, device_no, vehicle_id, odometer_km, fuel_level, photo_sha, photo_path, photo2_sha, photo2_path, created_at)
     VALUES (?, ?, ?, 'VEHICLE_IN', NULL, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    id,
    actor.companyId,
    actor.id,
    input.vehicleId,
    km,
    fuel,
    odometer.sha,
    odometer.path,
    new Date().toISOString(),
  );
  saveLogPhoto(id, "ODOMETER", odometer);
  saveLogPhoto(id, "FUEL", fuelPhoto);
  const vehicleDirection = directed(actor, "VEHICLE");
  if (vehicleDirection?.status === "RECEIVED" && vehicleDirection.vehicle_id === input.vehicleId) {
    run("UPDATE custody_directions SET status = 'RETURNED' WHERE id = ?", vehicleDirection.id);
  }
  audit(actor.companyId, actor.id, "custody.vehicle.in", "custody", id, { km, fuel, odometerSha: odometer.sha, fuelSha: fuelPhoto.sha });
  return { id };
}

export function listCustody(actor: SessionUser) {
  if (!actor.companyId) return [];
  const ownOnly = actor.role === "GUARD" || actor.role === "HR";
  return many<{ id: string; user_id: string; kind: string; device_no: string | null; odometer_km: number | null; fuel_level: string | null; created_at: string; name_ar: string }>(
    `SELECT custody_logs.id, custody_logs.user_id, custody_logs.kind, custody_logs.device_no, custody_logs.odometer_km, custody_logs.fuel_level, custody_logs.created_at, users.name_ar
     FROM custody_logs JOIN users ON users.id = custody_logs.user_id
     WHERE custody_logs.company_id = ? ${ownOnly ? "AND custody_logs.user_id = ?" : ""}
     ORDER BY custody_logs.created_at DESC LIMIT 40`,
    ...(ownOnly ? [actor.companyId, actor.id] : [actor.companyId]),
  );
}

export function judgePermit(companyId: string, registrationNo: string, validUntil: string, today = riyadhParts().date) {
  const registration = normalizeRegistration(registrationNo);
  const ban = one<{ reason: string; name_ar: string }>(
    "SELECT reason, name_ar FROM shop_bans WHERE company_id = ? AND registration_no = ?",
    companyId,
    registration,
  );
  return { registration, banned: Boolean(ban), expired: validUntil < today, reason: ban?.reason ?? null, banName: ban?.name_ar ?? null };
}

export function addBan(actor: SessionUser, input: { registrationNo: string; name: string; reason: string }) {
  if (!actor.companyId || (actor.role !== "SECURITY_MANAGER" && actor.role !== "TECH_ADMIN")) return { error: "err_permission" as const };
  const registration = normalizeRegistration(input.registrationNo);
  const name = input.name.trim();
  const reason = input.reason.trim();
  if (!/^[0-9A-Z]{5,20}$/.test(registration) || name.length < 2 || reason.length < 2) return { error: "err_permit" as const };
  const id = crypto.randomUUID();
  run(
    `INSERT INTO shop_bans (id, company_id, registration_no, name_ar, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(company_id, registration_no) DO UPDATE SET name_ar = excluded.name_ar, reason = excluded.reason`,
    id,
    actor.companyId,
    registration,
    name.slice(0, 120),
    reason.slice(0, 300),
    new Date().toISOString(),
  );
  audit(actor.companyId, actor.id, "permit.ban", "ban", registration, { name });
  return { registration };
}

export function checkPermit(actor: SessionUser, input: { shopName: string; registrationNo: string; validUntil: string }) {
  if (!actor.companyId || !["GUARD", "SUPERVISOR", "SECURITY_MANAGER"].includes(actor.role)) return { error: "err_permission" as const };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil)) return { error: "err_permit" as const };
  const shopName = input.shopName.trim();
  if (shopName.length < 2) return { error: "err_permit" as const };
  const judgment = judgePermit(actor.companyId, input.registrationNo, input.validUntil);
  if (!/^[0-9A-Z]{5,20}$/.test(judgment.registration)) return { error: "err_permit" as const };
  const id = crypto.randomUUID();
  run(
    "INSERT INTO permits (id, company_id, user_id, shop_name, registration_no, valid_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    actor.companyId,
    actor.id,
    shopName.slice(0, 120),
    judgment.registration,
    input.validUntil,
    new Date().toISOString(),
  );
  audit(actor.companyId, actor.id, "permit.check", "permit", id, { banned: judgment.banned, expired: judgment.expired });
  return { id, ...judgment };
}

const paperDecisions = ["ALLOWED", "REFUSED", "INFORMED"] as const;

export function recordPaperPermit(actor: SessionUser, input: { decision: string; note: string; photo?: Uint8Array }) {
  if (!actor.companyId || !["GUARD", "SUPERVISOR", "SECURITY_MANAGER"].includes(actor.role)) return { error: "err_permission" as const };
  if (!paperDecisions.includes(input.decision as (typeof paperDecisions)[number])) return { error: "err_permit" as const };
  const note = input.note.trim();
  if (input.decision === "INFORMED" && (note.length < 2 || note.length > 300)) return { error: "err_permit" as const };
  if (!input.photo) return { error: "err_file_type" as const };
  const photo = readPhoto(input.photo);
  if ("error" in photo) return photo;
  const id = crypto.randomUUID();
  const today = riyadhParts().date;
  run(
    `INSERT INTO permits (id, company_id, user_id, shop_name, registration_no, valid_until, created_at, decision, note, photo_path, photo_sha)
     VALUES (?, ?, ?, ?, 'PAPER', ?, ?, ?, ?, ?, ?)`,
    id,
    actor.companyId,
    actor.id,
    input.decision,
    today,
    new Date().toISOString(),
    input.decision,
    note.slice(0, 300),
    photo.path,
    photo.sha,
  );
  audit(actor.companyId, actor.id, "permit.photo", "permit", id, { decision: input.decision });
  return { id };
}

export function listPermits(actor: SessionUser) {
  if (!actor.companyId) return [];
  return many<{ id: string; shop_name: string; registration_no: string; valid_until: string; created_at: string; name_ar: string; employee_no: string | null; decision: string | null; note: string | null; photo_path: string | null }>(
    `SELECT permits.id, permits.shop_name, permits.registration_no, permits.valid_until, permits.created_at, permits.decision, permits.note, permits.photo_path, users.name_ar, users.employee_no
     FROM permits JOIN users ON users.id = permits.user_id
     WHERE permits.company_id = ? ORDER BY permits.created_at DESC LIMIT 40`,
    actor.companyId,
  ).map((row) => (row.registration_no === "PAPER" ? { ...row, banned: false, expired: false, registration: "PAPER", reason: null, banName: null } : { ...row, ...judgePermit(actor.companyId as string, row.registration_no, row.valid_until) }));
}

export function listBans(actor: SessionUser) {
  if (!actor.companyId || (actor.role !== "SECURITY_MANAGER" && actor.role !== "TECH_ADMIN")) return [];
  return many<{ registration_no: string; name_ar: string; reason: string }>(
    "SELECT registration_no, name_ar, reason FROM shop_bans WHERE company_id = ? ORDER BY name_ar",
    actor.companyId,
  );
}

const alertKinds = ["FIGHT", "SECURITY", "EMERGENCY", "CHILD"] as const;

export function raiseAlert(actor: SessionUser, input: { kind: string; body: string; photo?: Uint8Array }) {
  if (!actor.companyId) return { error: "err_permission" as const };
  if (!alertKinds.includes(input.kind as (typeof alertKinds)[number])) return { error: "err_permission" as const };
  const quiet = input.kind === "CHILD";
  const emergency = input.kind === "EMERGENCY";
  const legacy = input.kind === "FIGHT" || input.kind === "SECURITY";
  const allowed = legacy
    ? actor.role === "GUARD" || actor.role === "SUPERVISOR"
    : ["GUARD", "SUPERVISOR", "SECURITY_MANAGER", "HR", "TECH_ADMIN"].includes(actor.role);
  if (!allowed) return { error: "err_permission" as const };
  const body = input.body.trim();
  if (body.length < 5 || body.length > 500) return { error: "err_alert" as const };
  let photoPath: string | null = null;
  let photoSha: string | null = null;
  if (quiet || emergency) {
    if (!input.photo) return { error: "err_file_type" as const };
    const photo = readPhoto(input.photo);
    if ("error" in photo) return photo;
    photoPath = photo.path;
    photoSha = photo.sha;
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  run(
    "INSERT INTO alerts (id, company_id, user_id, kind, body, status, created_at, acked_by, acked_at, photo_path, photo_sha) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, NULL, NULL, ?, ?)",
    id,
    actor.companyId,
    actor.id,
    input.kind,
    body,
    createdAt,
    photoPath,
    photoSha,
  );
  audit(actor.companyId, actor.id, quiet ? "child.report" : "alert.raise", "alert", id, { kind: input.kind });
  return { id };
}

export function openAlerts(companyId: string) {
  return many<{ id: string; kind: string; body: string; created_at: string; name_ar: string; employee_no: string | null; photo_path: string | null }>(
    `SELECT alerts.id, alerts.kind, alerts.body, alerts.created_at, alerts.photo_path, users.name_ar, users.employee_no
     FROM alerts JOIN users ON users.id = alerts.user_id
     WHERE alerts.company_id = ? AND alerts.status = 'OPEN' AND alerts.kind != 'CHILD' ORDER BY alerts.created_at DESC`,
    companyId,
  );
}

export function childReports(companyId: string) {
  return many<{ id: string; body: string; status: string; created_at: string; name_ar: string; employee_no: string | null; photo_path: string | null }>(
    `SELECT alerts.id, alerts.body, alerts.status, alerts.created_at, alerts.photo_path, users.name_ar, users.employee_no
     FROM alerts JOIN users ON users.id = alerts.user_id
     WHERE alerts.company_id = ? AND alerts.kind = 'CHILD'
     ORDER BY alerts.created_at DESC LIMIT 30`,
    companyId,
  );
}

export function canCloseAlert(actor: SessionUser) {
  if (!actor.companyId) return false;
  if (actor.role === "SUPERVISOR") return true;
  return Boolean(one("SELECT user_id FROM alert_closers WHERE company_id = ? AND user_id = ?", actor.companyId, actor.id));
}

export function grantAlertClose(actor: SessionUser, userId: string) {
  if (!actor.companyId || actor.role !== "TECH_ADMIN") return { error: "err_permission" as const };
  const person = one<{ id: string }>("SELECT id FROM users WHERE id = ? AND company_id = ? AND status = 'ACTIVE'", userId, actor.companyId);
  if (!person) return { error: "err_permission" as const };
  run(
    `INSERT INTO alert_closers (company_id, user_id, granted_by, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(company_id, user_id) DO UPDATE SET granted_by = excluded.granted_by, created_at = excluded.created_at`,
    actor.companyId,
    person.id,
    actor.id,
    new Date().toISOString(),
  );
  audit(actor.companyId, actor.id, "alert.grant", "user", person.id, {});
  return { userId: person.id };
}

export function revokeAlertClose(actor: SessionUser, userId: string) {
  if (!actor.companyId || actor.role !== "TECH_ADMIN") return { error: "err_permission" as const };
  run("DELETE FROM alert_closers WHERE company_id = ? AND user_id = ?", actor.companyId, userId);
  audit(actor.companyId, actor.id, "alert.revoke", "user", userId, {});
  return { userId };
}

export function listAlertClosers(actor: SessionUser) {
  if (!actor.companyId || actor.role !== "TECH_ADMIN") return [];
  return many<{ id: string; name_ar: string; granted: number }>(
    `SELECT users.id, users.name_ar, CASE WHEN alert_closers.user_id IS NULL THEN 0 ELSE 1 END AS granted
     FROM users LEFT JOIN alert_closers ON alert_closers.user_id = users.id AND alert_closers.company_id = users.company_id
     WHERE users.company_id = ? AND users.status = 'ACTIVE' AND users.role != 'SUPERVISOR'
     ORDER BY users.name_ar`,
    actor.companyId,
  );
}

export function acknowledgeAlert(actor: SessionUser, alertId: string) {
  if (!canCloseAlert(actor) || !actor.companyId) return { error: "err_permission" as const };
  const alert = one<{ id: string }>("SELECT id FROM alerts WHERE id = ? AND company_id = ? AND status = 'OPEN'", alertId, actor.companyId);
  if (!alert) return { error: "err_permission" as const };
  run("UPDATE alerts SET status = 'ACK', acked_by = ?, acked_at = ? WHERE id = ?", actor.id, new Date().toISOString(), alert.id);
  audit(actor.companyId, actor.id, "alert.ack", "alert", alert.id, {});
  return { status: "ACK" as const };
}
