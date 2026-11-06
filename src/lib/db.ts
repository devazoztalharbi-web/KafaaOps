import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { canonical, dataDir, hashPassword, hmac, sha256, verifyPassword } from "./crypto";
import { developer } from "./developer";

export type Role =
  | "PLATFORM_ADMIN"
  | "TECH_ADMIN"
  | "HR"
  | "SECURITY_MANAGER"
  | "SUPERVISOR"
  | "GUARD";

export type UserRow = {
  id: string;
  company_id: string | null;
  email: string;
  name_ar: string;
  name_en: string;
  password_hash: string;
  role: Role;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED";
  employee_no: string | null;
  manager_id: string | null;
  shift_no: number | null;
  site_id: string | null;
  failed_logins: number;
  locked_until: string | null;
  created_at: string;
  auth_rev: number;
};

const schemaVersion = 12;
const globalDb = globalThis as unknown as { __kafaaDb?: DatabaseSync; __kafaaSchema?: number; __kafaaTech?: boolean };

export function db() {
  if (!globalDb.__kafaaDb) {
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(path.join(dataDir, "evidence"), { recursive: true });
    mkdirSync(path.join(dataDir, "files"), { recursive: true });
    const database = new DatabaseSync(path.join(dataDir, "kafaaops.db"));
    database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    globalDb.__kafaaDb = database;
  }
  if (globalDb.__kafaaSchema !== schemaVersion) {
    migrate(globalDb.__kafaaDb);
    seed(globalDb.__kafaaDb);
    globalDb.__kafaaSchema = schemaVersion;
  }
  if (!globalDb.__kafaaTech) {
    ensureTechAdmin(globalDb.__kafaaDb);
    globalDb.__kafaaTech = true;
  }
  return globalDb.__kafaaDb;
}

function plainRow<T>(value: unknown): T {
  return { ...(value as object) } as T;
}

export function one<T>(sql: string, ...params: Array<string | number | null>) {
  const value = db().prepare(sql).get(...params);
  return value === undefined ? undefined : plainRow<T>(value);
}

export function many<T>(sql: string, ...params: Array<string | number | null>) {
  return db().prepare(sql).all(...params).map((value) => plainRow<T>(value));
}

export function run(sql: string, ...params: Array<string | number | null | Uint8Array>) {
  return db().prepare(sql).run(...params);
}

function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      join_code TEXT NOT NULL UNIQUE,
      annual_leave_days INTEGER NOT NULL DEFAULT 21,
      max_accuracy_m INTEGER NOT NULL DEFAULT 150,
      match_threshold REAL NOT NULL DEFAULT 0.48,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      email TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      employee_no TEXT,
      manager_id TEXT,
      shift_no INTEGER,
      site_id TEXT,
      failed_logins INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      idle_minutes INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS login_throttle (
      email_hash TEXT PRIMARY KEY,
      fails INTEGER NOT NULL,
      locked_until TEXT
    );
    CREATE TABLE IF NOT EXISTS site_points (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(company_id, site_id, label)
    );
    CREATE TABLE IF NOT EXISTS postings (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      point_id TEXT NOT NULL,
      duty_date TEXT NOT NULL,
      assigned_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, duty_date)
    );
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      parent_id TEXT,
      kind TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      radius_m INTEGER,
      city TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS arrival_photos (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      duty_date TEXT NOT NULL,
      photo_sha TEXT NOT NULL,
      photo_path TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL NOT NULL,
      distance_m REAL NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, duty_date)
    );
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      shift_no INTEGER NOT NULL,
      start_minute INTEGER NOT NULL,
      end_minute INTEGER NOT NULL,
      grace_minute INTEGER NOT NULL,
      UNIQUE(company_id, shift_no)
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      work_date TEXT NOT NULL,
      kind TEXT NOT NULL,
      UNIQUE(user_id, work_date)
    );
    CREATE TABLE IF NOT EXISTS face_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      cipher BLOB NOT NULL,
      consent_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      active INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS face_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS punches (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      server_time TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      record_hash TEXT NOT NULL,
      hmac TEXT NOT NULL,
      UNIQUE(company_id, seq)
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      actor_id TEXT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      record_hash TEXT NOT NULL,
      hmac TEXT NOT NULL,
      UNIQUE(company_id, seq)
    );
    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT NOT NULL,
      route TEXT NOT NULL,
      attachment_name TEXT,
      attachment_path TEXT,
      attachment_sha TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leave_decisions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      request_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      record_hash TEXT NOT NULL,
      hmac TEXT NOT NULL,
      UNIQUE(company_id, seq)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      guard_id TEXT NOT NULL,
      supervisor_id TEXT,
      site_id TEXT NOT NULL,
      duty_date TEXT NOT NULL,
      status TEXT NOT NULL,
      rating INTEGER,
      review_note TEXT,
      created_at TEXT NOT NULL,
      submitted_at TEXT,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS field_reports (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(company_id, code)
    );
    CREATE TABLE IF NOT EXISTS custody_directions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      duty_date TEXT NOT NULL,
      kind TEXT NOT NULL,
      vehicle_id TEXT,
      note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      assigned_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(company_id, user_id, duty_date, kind)
    );
    CREATE TABLE IF NOT EXISTS custody_photos (
      id TEXT PRIMARY KEY,
      log_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      sha TEXT NOT NULL,
      path TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS custody_logs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      device_no TEXT,
      odometer_km INTEGER,
      fuel_level TEXT,
      photo_sha TEXT NOT NULL,
      photo_path TEXT NOT NULL,
      photo2_sha TEXT,
      photo2_path TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shop_bans (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      registration_no TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(company_id, registration_no)
    );
    CREATE TABLE IF NOT EXISTS permits (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      shop_name TEXT NOT NULL,
      registration_no TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acked_by TEXT,
      acked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS join_approvers (
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (company_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS alert_closers (
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (company_id, user_id)
    );
    CREATE TRIGGER IF NOT EXISTS punches_no_update BEFORE UPDATE ON punches
    BEGIN SELECT RAISE(ABORT, 'punch ledger is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS punches_no_delete BEFORE DELETE ON punches
    BEGIN SELECT RAISE(ABORT, 'punch ledger is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit ledger is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit ledger is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS leave_no_update BEFORE UPDATE ON leave_decisions
    BEGIN SELECT RAISE(ABORT, 'leave decisions are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS leave_no_delete BEFORE DELETE ON leave_decisions
    BEGIN SELECT RAISE(ABORT, 'leave decisions are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS leave_request_no_update BEFORE UPDATE ON leave_requests
    BEGIN SELECT RAISE(ABORT, 'leave requests are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS leave_request_no_delete BEFORE DELETE ON leave_requests
    BEGIN SELECT RAISE(ABORT, 'leave requests are immutable'); END;
  `);
  const columns = database.prepare("PRAGMA table_info(custody_logs)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "vehicle_id")) {
    database.exec("ALTER TABLE custody_logs ADD COLUMN vehicle_id TEXT");
  }
  const directionColumns = database.prepare("PRAGMA table_info(custody_directions)").all() as Array<{ name: string }>;
  if (directionColumns.length > 0 && !directionColumns.some((column) => column.name === "status")) {
    database.exec("ALTER TABLE custody_directions ADD COLUMN status TEXT NOT NULL DEFAULT 'OPEN'");
  }
  const siteColumns = database.prepare("PRAGMA table_info(sites)").all() as Array<{ name: string }>;
  if (siteColumns.length > 0 && !siteColumns.some((column) => column.name === "city")) {
    database.exec("ALTER TABLE sites ADD COLUMN city TEXT");
  }
  if (siteColumns.length > 0 && !siteColumns.some((column) => column.name === "incentive")) {
    database.exec("ALTER TABLE sites ADD COLUMN incentive TEXT");
  }
  const userColumns = database.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  if (userColumns.length > 0 && !userColumns.some((column) => column.name === "auth_rev")) {
    database.exec("ALTER TABLE users ADD COLUMN auth_rev INTEGER NOT NULL DEFAULT 0");
  }
  if (userColumns.length > 0 && !userColumns.some((column) => column.name === "photo_path")) {
    database.exec("ALTER TABLE users ADD COLUMN photo_path TEXT");
  }
  const permitColumns = database.prepare("PRAGMA table_info(permits)").all() as Array<{ name: string }>;
  if (permitColumns.length > 0 && !permitColumns.some((column) => column.name === "decision")) {
    database.exec("ALTER TABLE permits ADD COLUMN decision TEXT");
    database.exec("ALTER TABLE permits ADD COLUMN note TEXT");
    database.exec("ALTER TABLE permits ADD COLUMN photo_path TEXT");
    database.exec("ALTER TABLE permits ADD COLUMN photo_sha TEXT");
  }
  const alertColumns = database.prepare("PRAGMA table_info(alerts)").all() as Array<{ name: string }>;
  if (alertColumns.length > 0 && !alertColumns.some((column) => column.name === "photo_path")) {
    database.exec("ALTER TABLE alerts ADD COLUMN photo_path TEXT");
    database.exec("ALTER TABLE alerts ADD COLUMN photo_sha TEXT");
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS payroll_releases (
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      issued_by TEXT NOT NULL,
      PRIMARY KEY (company_id, user_id, period_start)
    );
    CREATE TABLE IF NOT EXISTS payroll_requests (
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (company_id, user_id, period_start)
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS capabilities (
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (company_id, user_id, capability)
    );
  `);
}

function ensureTechAdmin(database: DatabaseSync) {
  const email = (process.env.TECH_ADMIN_EMAIL ?? "devabulaziz@outlook.com").trim().toLowerCase();
  const password = process.env.TECH_ADMIN_PASSWORD?.trim() ?? "";
  const tech = database.prepare("SELECT id, email, password_hash, name_ar FROM users WHERE role = 'TECH_ADMIN' ORDER BY created_at LIMIT 1").get() as
    | { id: string; email: string; password_hash: string; name_ar: string }
    | undefined;
  if (!tech) return;
  if (tech.name_ar === "المسؤول التقني") {
    database.prepare("UPDATE users SET name_ar = ?, name_en = ? WHERE id = ?").run(developer.nameAr, developer.nameEn, tech.id);
  }
  const nextEmail = email.includes("@") ? email : tech.email;
  const occupied = database.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(nextEmail, tech.id) as { id: string } | undefined;
  const emailToStore = occupied ? tech.email : nextEmail;
  if (!password) {
    if (emailToStore !== tech.email) database.prepare("UPDATE users SET email = ? WHERE id = ?").run(emailToStore, tech.id);
    return;
  }
  if (emailToStore === tech.email && verifyPassword(password, tech.password_hash)) return;
  database.prepare("UPDATE users SET email = ?, password_hash = ?, status = 'ACTIVE' WHERE id = ?").run(emailToStore, hashPassword(password), tech.id);
}

function seed(database: DatabaseSync) {
  const existing = database.prepare("SELECT id FROM users LIMIT 1").get();
  if (existing) return;
  const now = new Date().toISOString();
  const password = hashPassword("Kafaa.Ops#2026");
  const companyId = crypto.randomUUID();
  database
    .prepare(
      `INSERT INTO companies
       (id, name_ar, name_en, join_code, annual_leave_days, max_accuracy_m, match_threshold, created_at)
       VALUES (?, ?, ?, ?, 21, 150, 0.48, ?)`,
    )
    .run(companyId, "تضاريس نجد للحراسات الأمنية", "Najd Terrain Security", "NAJD-TNS", now);

  database
    .prepare(
      `INSERT INTO users
       (id, company_id, email, name_ar, name_en, password_hash, role, status, employee_no, manager_id, shift_no, site_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'TECH_ADMIN', 'ACTIVE', 'T-001', NULL, NULL, NULL, ?)`,
    )
    .run(crypto.randomUUID(), companyId, "devabulaziz@outlook.com", "المسؤول التقني", "Technical admin", password, now);

  const insertShift = database.prepare(
    `INSERT INTO shifts (id, company_id, shift_no, start_minute, end_minute, grace_minute) VALUES (?, ?, ?, ?, ?, 15)`,
  );
  insertShift.run(crypto.randomUUID(), companyId, 1, 7 * 60, 15 * 60);
  insertShift.run(crypto.randomUUID(), companyId, 2, 15 * 60, 23 * 60);
  insertShift.run(crypto.randomUUID(), companyId, 3, 23 * 60, 7 * 60);
}

export function appendChain(
  table: "punches" | "audit_events" | "leave_decisions",
  companyId: string,
  columns: Record<string, string | number | null>,
  payload: Record<string, unknown>,
) {
  const database = db();
  const previous = database
    .prepare(`SELECT seq, record_hash FROM ${table} WHERE company_id = ? ORDER BY seq DESC LIMIT 1`)
    .get(companyId) as { seq: number; record_hash: string } | undefined;
  const seq = (previous?.seq ?? 0) + 1;
  const prevHash = previous?.record_hash ?? "0".repeat(64);
  const payloadJson = canonical({ ...payload, seq, prevHash });
  const payloadHash = sha256(payloadJson);
  const recordHash = sha256(prevHash + payloadHash);
  const signature = hmac(recordHash);
  const names = [...Object.keys(columns), "seq", "payload_json", "payload_hash", "prev_hash", "record_hash", "hmac"];
  const values = [...Object.values(columns), seq, payloadJson, payloadHash, prevHash, recordHash, signature];
  database.prepare(`INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`).run(...values);
  return { seq, recordHash };
}

export function verifyChain(table: "punches" | "audit_events" | "leave_decisions", companyId: string) {
  const rows = many<{
    seq: number;
    payload_json: string;
    payload_hash: string;
    prev_hash: string;
    record_hash: string;
    hmac: string;
  }>(
    `SELECT seq, payload_json, payload_hash, prev_hash, record_hash, hmac FROM ${table} WHERE company_id = ? ORDER BY seq`,
    companyId,
  );
  let expectedPrev = "0".repeat(64);
  for (const row of rows) {
    const payloadHash = sha256(row.payload_json);
    const recordHash = sha256(row.prev_hash + payloadHash);
    const parsed = JSON.parse(row.payload_json) as { seq?: number; prevHash?: string };
    if (
      row.seq !== parsed.seq ||
      row.prev_hash !== parsed.prevHash ||
      row.prev_hash !== expectedPrev ||
      row.payload_hash !== payloadHash ||
      row.record_hash !== recordHash ||
      row.hmac !== hmac(recordHash)
    ) {
      return { ok: false, checked: row.seq, total: rows.length };
    }
    expectedPrev = row.record_hash;
  }
  return { ok: true, checked: rows.length, total: rows.length };
}

export function audit(
  companyId: string,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  detail: Record<string, unknown> = {},
) {
  const createdAt = new Date().toISOString();
  appendChain(
    "audit_events",
    companyId,
    {
      id: crypto.randomUUID(),
      company_id: companyId,
      actor_id: actorId,
      action,
      entity,
      entity_id: entityId,
      created_at: createdAt,
    },
    { actorId, action, entity, entityId, createdAt, detail },
  );
}

export function activeTemplate(userId: string) {
  return one<{ id: string; version: number; cipher: Uint8Array }>(
    "SELECT id, version, cipher FROM face_templates WHERE user_id = ? AND active = 1 ORDER BY version DESC LIMIT 1",
    userId,
  );
}
