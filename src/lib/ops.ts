import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { audit, appendChain, many, one, run, verifyChain, type UserRow } from "./db";
import { dataDir, encrypt, sha256 } from "./crypto";
import { assertUpload } from "./files";
import { distanceMeters } from "./geo";
import { eachDate, riyadhParts } from "./time";
import { fieldPunchBlock, type IntegrityReport } from "./device-integrity";
import { consumeFaceProof } from "./face";
import { hasCapability } from "./grants";
import type { SessionUser } from "./auth";

export function createLeave(
  user: SessionUser,
  input: { type: string; start: string; end: string; reason: string; file?: Uint8Array; fileName?: string },
) {
  if (!user.companyId) return { error: "err_permission" as const };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end) || input.end < input.start) {
    return { error: "err_leave_dates" as const };
  }
  const types = ["ANNUAL", "SICK", "UNPAID", "OTHER"];
  if (!types.includes(input.type)) return { error: "err_permission" as const };
  const days = eachDate(input.start, input.end).length;
  if (days < 1 || days > 60) return { error: "err_leave_dates" as const };
  let attachmentName: string | null = null;
  let attachmentPath: string | null = null;
  let attachmentSha: string | null = null;
  if (input.type === "SICK" && !input.file) return { error: "err_sick_file" as const };
  if (input.file) {
    try {
      assertUpload(input.file);
    } catch {
      return { error: "err_file_type" as const };
    }
    const id = crypto.randomUUID();
    const target = path.join(dataDir, "files", `${id}.bin`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, encrypt(Buffer.from(input.file)));
    attachmentName = (input.fileName ?? "attachment").replace(/[^\w.\u0600-\u06FF-]/g, "").slice(0, 80);
    attachmentPath = target;
    attachmentSha = sha256(Buffer.from(input.file));
  }
  const route = user.role === "GUARD" ? "SUPERVISOR_THEN_MANAGER" : "MANAGER_ONLY";
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  run(
    `INSERT INTO leave_requests
     (id, company_id, user_id, type, start_date, end_date, days, reason, route, attachment_name, attachment_path, attachment_sha, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    user.companyId,
    user.id,
    input.type,
    input.start,
    input.end,
    days,
    input.reason.slice(0, 500),
    route,
    attachmentName,
    attachmentPath,
    attachmentSha,
    createdAt,
  );
  audit(user.companyId, user.id, "leave.create", "leave", id, { type: input.type, days });
  return { id };
}

function decisions(requestId: string) {
  return many<{ stage: string; decision: string; actor_id: string; created_at: string }>(
    `SELECT stage, decision, actor_id, created_at FROM leave_decisions WHERE request_id = ? ORDER BY seq`,
    requestId,
  );
}

export function leaveState(requestId: string) {
  const request = one<{ route: string }>("SELECT route FROM leave_requests WHERE id = ?", requestId);
  if (!request) return "MISSING" as const;
  const rows = decisions(requestId);
  const rejected = rows.find((row) => row.decision === "REJECT");
  if (rejected) return "REJECTED" as const;
  if (request.route === "MANAGER_ONLY") return rows.some((row) => row.stage === "MANAGER" && row.decision === "APPROVE") ? "APPROVED" as const : "PENDING_MANAGER" as const;
  const supervisor = rows.find((row) => row.stage === "SUPERVISOR" && row.decision === "APPROVE");
  if (!supervisor) return "PENDING_SUPERVISOR" as const;
  return rows.some((row) => row.stage === "MANAGER" && row.decision === "APPROVE") ? "APPROVED" as const : "PENDING_MANAGER" as const;
}

export function decideLeave(actor: SessionUser, requestId: string, decision: "APPROVE" | "REJECT", note: string) {
  if (!actor.companyId) return { error: "err_permission" as const };
  const request = one<{ id: string; company_id: string; user_id: string; route: string }>(
    "SELECT id, company_id, user_id, route FROM leave_requests WHERE id = ?",
    requestId,
  );
  if (!request || request.company_id !== actor.companyId) return { error: "err_permission" as const };
  const owner = one<UserRow>("SELECT * FROM users WHERE id = ?", request.user_id);
  if (!owner) return { error: "err_permission" as const };
  const state = leaveState(requestId);
  const stage = state === "PENDING_SUPERVISOR" ? "SUPERVISOR" : state === "PENDING_MANAGER" ? "MANAGER" : null;
  if (!stage) return { error: "err_permission" as const };
  if (stage === "SUPERVISOR" && (actor.role !== "SUPERVISOR" || owner.manager_id !== actor.id)) return { error: "err_permission" as const };
  if (stage === "MANAGER" && actor.role !== "SECURITY_MANAGER") return { error: "err_permission" as const };
  if (actor.id === request.user_id) return { error: "err_permission" as const };
  const createdAt = new Date().toISOString();
  appendChain(
    "leave_decisions",
    actor.companyId,
    {
      id: crypto.randomUUID(),
      company_id: actor.companyId,
      request_id: requestId,
      stage,
      actor_id: actor.id,
      decision,
      note: note.slice(0, 300),
      created_at: createdAt,
    },
    { requestId, stage, actorId: actor.id, decision, note: note.slice(0, 300), createdAt },
  );
  audit(actor.companyId, actor.id, "leave.decide", "leave", requestId, { stage, decision });
  return { state: leaveState(requestId) };
}

export function checkGeofence(companyId: string, siteId: string, lat: number, lng: number, accuracy: number) {
  const site = one<{ company_id: string; latitude: number; longitude: number; radius_m: number; active: number }>(
    "SELECT company_id, latitude, longitude, radius_m, active FROM sites WHERE id = ?",
    siteId,
  );
  const company = one<{ max_accuracy_m: number }>("SELECT max_accuracy_m FROM companies WHERE id = ?", companyId);
  if (!site || !site.active || site.company_id !== companyId || site.latitude == null) return { error: "err_fence" as const };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) return { error: "err_fence" as const };
  if (accuracy <= 0 || accuracy > (company?.max_accuracy_m ?? 150)) return { error: "err_accuracy" as const };
  const distance = distanceMeters(lat, lng, site.latitude, site.longitude);
  if (distance > site.radius_m) return { error: "err_fence" as const, distance };
  return { distance };
}

export function recordPunch(
  user: SessionUser,
  input: {
    siteId: string;
    kind: "IN" | "OUT" | "CHECK";
    lat: number;
    lng: number;
    accuracy: number;
    clientTime?: string;
    userAgent: string;
    integrity: IntegrityReport | null;
    imageSha: string;
    faceProof: string;
  },
) {
  if (!user.companyId || (user.role !== "GUARD" && user.role !== "SUPERVISOR")) return { error: "err_permission" as const };
  const face = consumeFaceProof(input.faceProof, user.id);
  if (!face) return { error: "err_face" as const };
  const block = fieldPunchBlock(input.integrity, input.userAgent);
  if (block) return { error: block };
  const fence = checkGeofence(user.companyId, input.siteId, input.lat, input.lng, input.accuracy);
  if ("error" in fence) return fence;
  const reused = one<{ id: string }>(
    "SELECT id FROM punches WHERE company_id = ? AND payload_json LIKE ?",
    user.companyId,
    `%${input.imageSha}%`,
  );
  if (reused) return { error: "err_replay" as const };
  const serverTime = new Date().toISOString();
  const id = crypto.randomUUID();
  appendChain(
    "punches",
    user.companyId,
    {
      id,
      company_id: user.companyId,
      user_id: user.id,
      site_id: input.siteId,
      kind: input.kind,
      server_time: serverTime,
    },
    {
      id,
      userId: user.id,
      siteId: input.siteId,
      kind: input.kind,
      serverTime,
      clientTimeIgnored: input.clientTime ?? null,
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy,
      distance: fence.distance,
      imageSha: input.imageSha,
      faceDistance: face.distance,
    },
  );
  audit(user.companyId, user.id, "punch", "punch", id, { kind: input.kind, serverTime });
  return { id, serverTime, distance: fence.distance };
}

export function setSiteFence(actor: SessionUser, input: { siteId: string; lat: number; lng: number; radius: number }) {
  if (!hasCapability(actor, "edit_fence") || !actor.companyId) return { error: "err_permission" as const };
  if (!Number.isInteger(input.radius) || input.radius < 30 || input.radius > 5000) return { error: "err_fence" as const };
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) return { error: "err_fence" as const };
  const site = one<{ id: string }>("SELECT id FROM sites WHERE id = ? AND company_id = ? AND kind IN ('COMPLEX', 'SITE') AND active = 1", input.siteId, actor.companyId);
  if (!site) return { error: "err_permission" as const };
  run("UPDATE sites SET latitude = ?, longitude = ?, radius_m = ? WHERE id = ?", input.lat, input.lng, input.radius, site.id);
  audit(actor.companyId, actor.id, "site.fence", "site", site.id, { lat: input.lat, lng: input.lng, radius: input.radius });
  return { radius: input.radius };
}

const placeKinds = ["مجمع", "مجمع تجاري", "سوق", "سوق تجاري", "موقع"] as const;

export function addPlace(actor: SessionUser, input: { name: string; city: string; kind: string; lat: number; lng: number; radius: number }) {
  if (!actor.companyId || actor.role !== "TECH_ADMIN") return { error: "err_permission" as const };
  const name = input.name.trim();
  const city = input.city.trim();
  if (name.length < 2 || name.length > 80 || city.length < 2 || city.length > 40) return { error: "err_place" as const };
  if (!placeKinds.includes(input.kind as (typeof placeKinds)[number])) return { error: "err_place" as const };
  if (!Number.isInteger(input.radius) || input.radius < 30 || input.radius > 5000) return { error: "err_fence" as const };
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) return { error: "err_fence" as const };
  const id = crypto.randomUUID();
  run(
    "INSERT INTO sites (id, company_id, parent_id, kind, name_ar, name_en, city, latitude, longitude, radius_m, active) VALUES (?, ?, NULL, 'COMPLEX', ?, ?, ?, ?, ?, ?, 1)",
    id,
    actor.companyId,
    name,
    input.kind,
    city,
    input.lat,
    input.lng,
    input.radius,
  );
  audit(actor.companyId, actor.id, "place.add", "site", id, { name, city, kind: input.kind, radius: input.radius });
  return { id };
}

export function addWorkSite(actor: SessionUser, input: { parentId: string; name: string; lat: number; lng: number; radius: number }) {
  if (!actor.companyId || actor.role !== "TECH_ADMIN") return { error: "err_permission" as const };
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) return { error: "err_place" as const };
  if (!Number.isInteger(input.radius) || input.radius < 30 || input.radius > 5000) return { error: "err_fence" as const };
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) return { error: "err_fence" as const };
  const parent = one<{ id: string }>("SELECT id FROM sites WHERE id = ? AND company_id = ? AND kind = 'COMPLEX' AND active = 1", input.parentId, actor.companyId);
  if (!parent) return { error: "err_place" as const };
  const id = crypto.randomUUID();
  run(
    "INSERT INTO sites (id, company_id, parent_id, kind, name_ar, name_en, city, latitude, longitude, radius_m, active) VALUES (?, ?, ?, 'SITE', ?, ?, NULL, ?, ?, ?, 1)",
    id,
    actor.companyId,
    parent.id,
    name,
    name,
    input.lat,
    input.lng,
    input.radius,
  );
  audit(actor.companyId, actor.id, "site.add", "site", id, { name, radius: input.radius });
  return { id };
}

export function punchedInToday(companyId: string, userId: string) {
  const today = riyadhParts().date;
  const rows = many<{ server_time: string }>(
    "SELECT server_time FROM punches WHERE company_id = ? AND user_id = ? AND kind = 'IN' ORDER BY server_time DESC LIMIT 8",
    companyId,
    userId,
  );
  return rows.some((row) => riyadhParts(new Date(row.server_time)).date === today);
}

export function todayArrival(companyId: string, userId: string) {
  return one<{ id: string; created_at: string; distance_m: number }>(
    "SELECT id, created_at, distance_m FROM arrival_photos WHERE company_id = ? AND user_id = ? AND duty_date = ?",
    companyId,
    userId,
    riyadhParts().date,
  );
}

export function recordArrival(actor: SessionUser, input: { lat: number; lng: number; accuracy: number; photo?: Uint8Array }) {
  if (!actor.companyId || !actor.siteId || (actor.role !== "GUARD" && actor.role !== "SUPERVISOR")) return { error: "err_permission" as const };
  if (!punchedInToday(actor.companyId, actor.id)) return { error: "err_attendance" as const };
  if (!input.photo) return { error: "err_file_type" as const };
  let stored: { sha: string; path: string };
  try {
    const kind = assertUpload(input.photo);
    if (kind === "pdf") return { error: "err_file_type" as const };
    const id = crypto.randomUUID();
    const target = path.join(dataDir, "files", `${id}.bin`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, encrypt(Buffer.from(input.photo)));
    stored = { sha: sha256(Buffer.from(input.photo)), path: target };
  } catch {
    return { error: "err_file_type" as const };
  }
  const fence = checkGeofence(actor.companyId, actor.siteId, input.lat, input.lng, input.accuracy);
  if ("error" in fence) return fence;
  const dutyDate = riyadhParts().date;
  const createdAt = new Date().toISOString();
  run(
    `INSERT INTO arrival_photos (id, company_id, user_id, site_id, duty_date, photo_sha, photo_path, latitude, longitude, accuracy, distance_m, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, duty_date) DO UPDATE SET
       photo_sha = excluded.photo_sha, photo_path = excluded.photo_path, latitude = excluded.latitude, longitude = excluded.longitude,
       accuracy = excluded.accuracy, distance_m = excluded.distance_m, created_at = excluded.created_at`,
    crypto.randomUUID(),
    actor.companyId,
    actor.id,
    actor.siteId,
    dutyDate,
    stored.sha,
    stored.path,
    input.lat,
    input.lng,
    input.accuracy,
    fence.distance,
    createdAt,
  );
  audit(actor.companyId, actor.id, "arrival.photo", "site", actor.siteId, { dutyDate, distance: fence.distance });
  return { dutyDate, distance: fence.distance };
}

export function companyChains(companyId: string) {
  return {
    punches: verifyChain("punches", companyId),
    audit: verifyChain("audit_events", companyId),
    leaves: verifyChain("leave_decisions", companyId),
  };
}
