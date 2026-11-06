import { canApproveJoin } from "./join";
import type { SessionUser } from "./auth";

const catalog = [
  { href: "/app", label: "الرئيسية" },
  { href: "/app/attendance", label: "الحضور" },
  { href: "/app/schedule", label: "الجدول" },
  { href: "/app/payroll", label: "المسير" },
  { href: "/app/leaves", label: "الإجازات" },
  { href: "/app/tasks", label: "المهام" },
  { href: "/app/custody", label: "العهد" },
  { href: "/app/permits", label: "التصاريح" },
  { href: "/app/alerts", label: "البلاغات" },
  { href: "/app/security", label: "فحص السجل" },
  { href: "/app/info", label: "معلومات" },
  { href: "/app/people", label: "الطلبات" },
] as const;

const byRole: Record<SessionUser["role"], string[]> = {
  PLATFORM_ADMIN: ["/app", "/app/info", "/app/security"],
  TECH_ADMIN: catalog.map((item) => item.href),
  SECURITY_MANAGER: ["/app", "/app/schedule", "/app/payroll", "/app/leaves", "/app/tasks", "/app/permits", "/app/alerts", "/app/security", "/app/info"],
  HR: ["/app", "/app/payroll", "/app/leaves", "/app/security", "/app/info"],
  SUPERVISOR: ["/app", "/app/attendance", "/app/schedule", "/app/leaves", "/app/tasks", "/app/custody", "/app/permits", "/app/alerts", "/app/info"],
  GUARD: ["/app", "/app/attendance", "/app/schedule", "/app/leaves", "/app/tasks", "/app/custody", "/app/permits", "/app/alerts", "/app/info"],
};

export function allowedPaths(user: SessionUser) {
  const paths = new Set(byRole[user.role] ?? ["/app", "/app/info"]);
  if (canApproveJoin(user)) paths.add("/app/people");
  return paths;
}

export function navigation(user: SessionUser) {
  const paths = allowedPaths(user);
  return catalog.filter((item) => paths.has(item.href));
}

export function pathAllowed(user: SessionUser, path: string) {
  return [...allowedPaths(user)].some((href) => (href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`)));
}
