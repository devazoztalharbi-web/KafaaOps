import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { audit, one, run, type Role, type UserRow } from "./db";
import { hashPassword, sha256, verifyPassword } from "./crypto";

const IDLE_MINUTES: Record<Role, number> = {
  PLATFORM_ADMIN: 30,
  TECH_ADMIN: 30,
  HR: 30,
  SECURITY_MANAGER: 30,
  SUPERVISOR: 120,
  GUARD: 480,
};

const dummyHash = hashPassword("Kafaa.Ops#dummy");

export function publicUser(user: UserRow) {
  return {
    id: user.id,
    companyId: user.company_id,
    email: user.email,
    nameAr: user.name_ar,
    nameEn: user.name_en,
    role: user.role,
    employeeNo: user.employee_no,
    managerId: user.manager_id,
    shiftNo: user.shift_no,
    siteId: user.site_id,
  };
}

export type SessionUser = ReturnType<typeof publicUser>;

function sessionSecret() {
  return process.env.SESSION_SECRET?.trim() ?? "";
}

function signedToken(email: string) {
  const secret = sessionSecret();
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify({ email: email.trim().toLowerCase(), exp: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function readSigned(token: string) {
  const secret = sessionSecret();
  const dot = token.lastIndexOf(".");
  if (!secret || dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const actual = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as { email?: string; exp?: number };
    if (!parsed.email || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return parsed.email;
  } catch {
    return null;
  }
}

export function login(email: string, password: string, meta: { ip: string; userAgent: string }) {
  const key = sha256(email.trim().toLowerCase());
  const throttle = one<{ fails: number; locked_until: string | null }>(
    "SELECT fails, locked_until FROM login_throttle WHERE email_hash = ?",
    key,
  );
  if (throttle?.locked_until && Date.parse(throttle.locked_until) > Date.now()) {
    return { error: "err_locked" as const };
  }
  const user = one<UserRow>("SELECT * FROM users WHERE email = ?", email.trim().toLowerCase());
  const stored = user?.password_hash ?? dummyHash;
  const passwordOk = verifyPassword(password, stored);
  if (user && passwordOk && user.status === "PENDING") return { error: "err_pending" as const };
  if (user && passwordOk && user.status === "REJECTED") return { error: "err_rejected" as const };
  const ok = passwordOk && user?.status === "ACTIVE";
  if (!ok || !user) {
    const fails = (throttle?.fails ?? 0) + 1;
    const locked = fails >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    run(
      `INSERT INTO login_throttle (email_hash, fails, locked_until) VALUES (?, ?, ?)
       ON CONFLICT(email_hash) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until`,
      key,
      fails,
      locked,
    );
    return { error: "err_bad_login" as const };
  }
  run("UPDATE login_throttle SET fails = 0, locked_until = NULL WHERE email_hash = ?", key);
  run("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?", user.id);
  const token = signedToken(user.email) ?? randomBytes(32).toString("base64url");
  if (!sessionSecret()) {
    const now = new Date();
    const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
    run(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen, idle_minutes, revoked)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      crypto.randomUUID(),
      user.id,
      sha256(token),
      now.toISOString(),
      expires,
      now.toISOString(),
      IDLE_MINUTES[user.role],
    );
  }
  if (user.company_id) audit(user.company_id, user.id, "login", "session", user.id, meta);
  return { token, user: publicUser(user) };
}

export function sessionUser(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const email = readSigned(token);
  if (email) {
    const signedUser = one<UserRow>("SELECT * FROM users WHERE email = ? AND status = 'ACTIVE'", email);
    return signedUser ? publicUser(signedUser) : null;
  }
  const row = one<{
    user_id: string;
    expires_at: string;
    last_seen: string;
    idle_minutes: number;
    revoked: number;
  }>("SELECT user_id, expires_at, last_seen, idle_minutes, revoked FROM sessions WHERE token_hash = ?", sha256(token));
  if (!row || row.revoked) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) < now) return null;
  if (now - Date.parse(row.last_seen) > row.idle_minutes * 60 * 1000) return null;
  if (now - Date.parse(row.last_seen) > 60 * 1000) {
    run("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", new Date(now).toISOString(), sha256(token));
  }
  const user = one<UserRow>("SELECT * FROM users WHERE id = ? AND status = 'ACTIVE'", row.user_id);
  return user ? publicUser(user) : null;
}

export function revoke(token: string | undefined | null) {
  if (!token) return;
  run("UPDATE sessions SET revoked = 1 WHERE token_hash = ?", sha256(token));
}

export function can(user: SessionUser, action: "leave-team" | "leave-final" | "payroll" | "sites" | "audit") {
  const map: Record<typeof action, Role[]> = {
    "leave-team": ["SUPERVISOR"],
    "leave-final": ["SECURITY_MANAGER"],
    payroll: ["HR", "TECH_ADMIN", "SECURITY_MANAGER"],
    sites: ["TECH_ADMIN"],
    audit: ["TECH_ADMIN", "HR", "SECURITY_MANAGER", "PLATFORM_ADMIN"],
  };
  return map[action].includes(user.role);
}
