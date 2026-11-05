import { many } from "@/lib/db";
import { listPoints, teamPostings, todayPosting } from "@/lib/posts";
import { currentUser, directAction, fenceAction, pointAction } from "@/server/actions";

const roles: Record<string, string> = {
  PLATFORM_ADMIN: "مدير المنصة",
  TECH_ADMIN: "المسؤول التقني",
  HR: "الموارد البشرية",
  SECURITY_MANAGER: "مدير الأمن",
  SUPERVISOR: "مشرف الوردية",
  GUARD: "حارس الأمن",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const query = await searchParams;
  const user = await currentUser();
  if (!user?.companyId) return user ? <section><h1 className="text-2xl font-semibold">مرحباً {user.nameAr}</h1></section> : null;
  const posting = todayPosting(user.companyId, user.id);
  const points = listPoints(user.companyId);
  const guards = user.role === "SUPERVISOR"
    ? many<{ id: string; name_ar: string }>("SELECT id, name_ar FROM users WHERE company_id = ? AND role = 'GUARD' AND status = 'ACTIVE' AND manager_id = ? ORDER BY name_ar", user.companyId, user.id)
    : [];
  const sites = user.role === "TECH_ADMIN" || user.role === "SECURITY_MANAGER"
    ? many<{ id: string; name_ar: string; latitude: number | null; longitude: number | null; radius_m: number | null }>("SELECT id, name_ar, latitude, longitude, radius_m FROM sites WHERE company_id = ? AND active = 1 ORDER BY name_ar", user.companyId)
    : [];
  const directed = teamPostings(user);
  return (
    <section>
      <h1 className="text-2xl font-semibold">مرحباً {user.nameAr}</h1>
      <p className="mt-2 text-ink/70">{roles[user.role]}</p>
      {query.e && query.e !== "ok" ? <p className="mt-3 text-sm">تعذر التنفيذ: {query.e}</p> : null}
      {posting ? (
        <p className="mt-4 rounded-2xl bg-teal px-4 py-4 text-lg text-white">توجهك اليوم: {posting.label} · {posting.site_name}</p>
      ) : null}
      {user.role === "SUPERVISOR" ? (
        <form action={directAction} className="mt-4 grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-3">
          <select name="userId" className="rounded-xl border border-line px-3 py-2" required>
            {guards.map((guard) => <option key={guard.id} value={guard.id}>{guard.name_ar}</option>)}
          </select>
          <select name="pointId" className="rounded-xl border border-line px-3 py-2" required>
            {points.map((point) => <option key={point.id} value={point.id}>{point.site_name} · {point.label}</option>)}
          </select>
          <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">وجّه بداية الدوام</button>
        </form>
      ) : null}
      {directed.length ? (
        <ul className="mt-4 space-y-2">
          {directed.map((row) => <li key={row.name_ar} className="rounded-xl border border-line bg-card px-4 py-2 text-sm">{row.name_ar} · {row.label} · {row.site_name}</li>)}
        </ul>
      ) : null}
      {sites.length ? (
        <form action={fenceAction} className="mt-6 grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-4">
          <select name="siteId" className="rounded-xl border border-line px-3 py-2">
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name_ar} · {site.radius_m ?? "—"} م</option>)}
          </select>
          <input name="lat" required type="number" step="any" placeholder="خط العرض" className="rounded-xl border border-line px-3 py-2" />
          <input name="lng" required type="number" step="any" placeholder="خط الطول" className="rounded-xl border border-line px-3 py-2" />
          <input name="radius" required type="number" min={30} max={5000} placeholder="المسافة بالمتر، مثل 900" className="rounded-xl border border-line px-3 py-2" />
          <button className="rounded-xl bg-ink px-3 py-2 text-paper md:col-span-4" type="submit">احفظ إحداثيات الموقع ومسافته</button>
        </form>
      ) : null}
      {sites.length ? (
        <form action={pointAction} className="mt-6 grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-3">
          <select name="siteId" className="rounded-xl border border-line px-3 py-2">
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name_ar}</option>)}
          </select>
          <input name="label" required placeholder="سين 1 أو زون 2" className="rounded-xl border border-line px-3 py-2" />
          <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">أضف مسمى للموقع</button>
        </form>
      ) : null}
      {points.length && sites.length ? (
        <p className="mt-3 text-sm text-ink/70">{points.map((point) => `${point.site_name}: ${point.label}`).join(" · ")}</p>
      ) : null}
    </section>
  );
}
