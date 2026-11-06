import { many, one } from "@/lib/db";
import { grantedCapabilities, hasCapability } from "@/lib/grants";
import { listPoints, teamPostings, todayPosting } from "@/lib/posts";
import { riyadhParts } from "@/lib/time";
import { capabilityAction, currentUser, directAction, fenceAction, placeAction, pointAction } from "@/server/actions";

const roles: Record<string, string> = {
  PLATFORM_ADMIN: "مدير المنصة",
  TECH_ADMIN: "المسؤول التقني",
  HR: "الموارد البشرية",
  SECURITY_MANAGER: "مدير الأمن",
  SUPERVISOR: "مشرف الوردية",
  GUARD: "حارس الأمن",
};

const capabilityLabels: Record<string, string> = {
  approve_join: "قبول التسجيل",
  edit_fence: "موقع البصمة",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const query = await searchParams;
  const user = await currentUser();
  if (!user?.companyId) return user ? <section><h1 className="text-2xl font-semibold">مرحباً {user.nameAr}</h1></section> : null;
  const posting = todayPosting(user.companyId, user.id);
  const canEditFence = hasCapability(user, "edit_fence");
  const points = canEditFence || user.role === "SUPERVISOR" ? listPoints(user.companyId) : [];
  const guards = user.role === "SUPERVISOR"
    ? many<{ id: string; name_ar: string }>("SELECT id, name_ar FROM users WHERE company_id = ? AND role = 'GUARD' AND status = 'ACTIVE' AND manager_id = ? ORDER BY name_ar", user.companyId, user.id)
    : [];
  const places = user.role === "TECH_ADMIN" || canEditFence
    ? many<{ id: string; name_ar: string; name_en: string; city: string | null; radius_m: number | null }>("SELECT id, name_ar, name_en, city, radius_m FROM sites WHERE company_id = ? AND kind = 'COMPLEX' AND active = 1 ORDER BY name_ar", user.companyId)
    : [];
  const people = user.role === "TECH_ADMIN"
    ? many<{ id: string; name_ar: string; role: string }>("SELECT id, name_ar, role FROM users WHERE company_id = ? AND status = 'ACTIVE' AND id != ? ORDER BY name_ar", user.companyId, user.id)
    : [];
  const grants = user.role === "TECH_ADMIN" ? new Set(grantedCapabilities(user.companyId).map((row) => `${row.user_id}:${row.capability}`)) : new Set<string>();
  const approvers = user.role === "TECH_ADMIN" ? new Set(many<{ user_id: string }>("SELECT user_id FROM join_approvers WHERE company_id = ?", user.companyId).map((row) => row.user_id)) : new Set<string>();
  const directed = teamPostings(user);
  const today = riyadhParts().date;
  return (
    <section>
      <h1 className="text-2xl font-semibold">مرحباً {user.nameAr}</h1>
      <p className="mt-2 text-ink/70">{roles[user.role]}</p>
      {query.e && query.e !== "ok" ? <p className="mt-3 text-sm">تعذر التنفيذ: {query.e}</p> : null}
      {query.e === "ok" ? <p className="mt-3 text-sm">تم الحفظ.</p> : null}
      {posting ? (
        <p className="mt-4 rounded-2xl bg-teal px-4 py-4 text-lg text-white">توجهك اليوم: {posting.label} · {posting.site_name}</p>
      ) : null}

      {user.role === "SECURITY_MANAGER" ? <ManagerStats companyId={user.companyId} today={today} /> : null}
      {user.role === "HR" ? <HrHome companyId={user.companyId} /> : null}
      {user.role === "GUARD" ? (
        <p className="mt-4 max-w-xl text-sm leading-7 text-ink/70">الحضور يثبت الدوام والغياب. بعد الحضور صوّر وصولك داخل مسافة الموقع، ثم استلم العهدة من صفحتها.</p>
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

      {user.role === "TECH_ADMIN" ? (
        <div className="mt-6 space-y-4">
          <h2 className="font-semibold">المواقع</h2>
          <p className="text-sm leading-7 text-ink/70">اكتب المدينة واسم المجمع مرة واحدة، ثم الطول والعرض، وتحتهم المسافة التي تُقبل داخلها بصمة بداية الدوام وسيلفي الوصول. أسماء النقاط داخل المجمع، مثل س1 أو زون 1، بلا إحداثيات.</p>
          <form action={placeAction} className="grid max-w-xl gap-3 rounded-2xl border border-line bg-card p-4">
            <label className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 font-semibold">المدينة</span>
              <input name="city" required placeholder="جدة" className="w-full rounded-xl border border-line px-3 py-2" />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 font-semibold">اسم المجمع</span>
              <input name="name" required placeholder="اكتب اسم المجمع" className="w-full rounded-xl border border-line px-3 py-2" />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 font-semibold">الطول</span>
              <input name="lng" required inputMode="decimal" placeholder="39.1728" className="w-full rounded-xl border border-line px-3 py-2" />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 font-semibold">العرض</span>
              <input name="lat" required inputMode="decimal" placeholder="21.5432" className="w-full rounded-xl border border-line px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">المسافة المسموحة للبصمة والسيلفي (متر)</span>
              <input name="radius" required inputMode="numeric" placeholder="900" className="rounded-xl border border-line px-3 py-2" />
            </label>
            <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">أضف الموقع</button>
          </form>
          {places.length ? (
            <ul className="space-y-2 text-sm">
              {places.map((place) => <li key={place.id} className="rounded-xl border border-line bg-card px-4 py-2">{place.city} · {place.name_ar} · {place.radius_m ?? "—"} م</li>)}
            </ul>
          ) : <p className="text-sm">لا توجد أماكن بعد.</p>}
        </div>
      ) : null}

      {canEditFence && places.length ? (
        <form action={fenceAction} className="mt-6 grid max-w-xl gap-3 rounded-2xl border border-line bg-card p-4">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">المجمع</span>
            <select name="siteId" className="rounded-xl border border-line px-3 py-2">
              {places.map((place) => <option key={place.id} value={place.id}>{place.city} · {place.name_ar} · {place.radius_m ?? "—"} م</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 font-semibold">الطول</span>
            <input name="lng" required inputMode="decimal" placeholder="39.1728" className="w-full rounded-xl border border-line px-3 py-2" />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 font-semibold">العرض</span>
            <input name="lat" required inputMode="decimal" placeholder="21.5432" className="w-full rounded-xl border border-line px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">المسافة المسموحة للبصمة والسيلفي (متر)</span>
            <input name="radius" required inputMode="numeric" placeholder="900" className="rounded-xl border border-line px-3 py-2" />
          </label>
          <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">احفظ إحداثيات المجمع ومسافته</button>
        </form>
      ) : null}
      {canEditFence && places.length ? (
        <form action={pointAction} className="mt-6 grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-3">
          <select name="siteId" className="rounded-xl border border-line px-3 py-2">
            {places.map((place) => <option key={place.id} value={place.id}>{place.name_ar}</option>)}
          </select>
          <input name="label" required placeholder="سين 1 أو البوابة" className="rounded-xl border border-line px-3 py-2" />
          <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">أضف اسماً داخل المكان</button>
        </form>
      ) : null}
      {canEditFence && points.length ? (
        <p className="mt-3 text-sm text-ink/70">{points.map((point) => `${point.site_name}: ${point.label}`).join(" · ")}</p>
      ) : null}

      {user.role === "TECH_ADMIN" ? (
        <div className="mt-8">
          <h2 className="font-semibold">الصلاحيات</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/70">بجانب كل موظف زرّان: موقع البصمة يفتح له تعديل إحداثيات المجمع ومسافته، وقبول التسجيل يفتح له قبول الموظفين الجدد. اضغط الزر لمنح الصلاحية، واضغطه مرة أخرى لسحبها. خانات الطول والعرض عند إضافة مجمع تبقى في حسابك فقط.</p>
          {people.length ? (
            <ul className="mt-3 space-y-2">
              {people.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm">
                  <p>{person.name_ar} · {roles[person.role]}</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(capabilityLabels).map(([capability, label]) => {
                      const held = grants.has(`${person.id}:${capability}`) || (capability === "approve_join" && approvers.has(person.id));
                      return (
                        <form key={capability} action={capabilityAction}>
                          <input type="hidden" name="userId" value={person.id} />
                          <input type="hidden" name="capability" value={capability} />
                          <button name="mode" value={held ? "revoke" : "grant"} className={`rounded-full border px-3 py-2 ${held ? "border-teal bg-teal text-white" : "border-line bg-paper"}`} type="submit" aria-pressed={held}>
                            {capability === "edit_fence" ? "⌖ " : "✓ "}
                            {held ? label : `منح ${label}`}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm">لا يوجد موظفون بعد. يظهرون هنا بعد قبول تسجيلهم.</p>}
        </div>
      ) : null}
    </section>
  );
}

function ManagerStats({ companyId, today }: { companyId: string; today: string }) {
  const staff = Number(one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE company_id = ? AND status = 'ACTIVE' AND role IN ('GUARD', 'SUPERVISOR')", companyId)?.n ?? 0);
  const openTasks = Number(one<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE company_id = ? AND status IN ('OPEN', 'SUBMITTED')", companyId)?.n ?? 0);
  const openAlerts = Number(one<{ n: number }>("SELECT COUNT(*) AS n FROM alerts WHERE company_id = ? AND status = 'OPEN'", companyId)?.n ?? 0);
  const rated = many<{ rating: number | null }>("SELECT rating FROM tasks WHERE company_id = ? AND rating IS NOT NULL", companyId);
  const average = rated.length ? Math.round((rated.reduce((sum, row) => sum + (row.rating ?? 0), 0) / rated.length) * 10) / 10 : null;
  const punches = many<{ user_id: string; server_time: string }>("SELECT user_id, server_time FROM punches WHERE company_id = ? AND kind = 'IN' ORDER BY server_time DESC LIMIT 400", companyId);
  const present = new Set(punches.filter((row) => riyadhParts(new Date(row.server_time)).date === today).map((row) => row.user_id)).size;
  const postings = many<{ name_ar: string; label: string; site_name: string }>(
    `SELECT users.name_ar, site_points.label, sites.name_ar AS site_name
     FROM postings JOIN users ON users.id = postings.user_id
     JOIN site_points ON site_points.id = postings.point_id
     JOIN sites ON sites.id = site_points.site_id
     WHERE postings.company_id = ? AND postings.duty_date = ?
     ORDER BY users.name_ar`,
    companyId,
    today,
  );
  const cards = [
    ["الموظفون الميدانيون", String(staff)],
    ["حضور اليوم", String(present)],
    ["المهام المفتوحة", String(openTasks)],
    ["متوسط تقييم المهام", average === null ? "—" : String(average)],
    ["البلاغات المفتوحة", String(openAlerts)],
    ["توجيهات اليوم", String(postings.length)],
  ];
  return (
    <div className="mt-6">
      <h2 className="font-semibold">أداء اليوم</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-sm text-ink/70">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {postings.length ? (
        <ul className="mt-4 space-y-2">
          {postings.map((row) => <li key={`${row.name_ar}-${row.label}`} className="rounded-xl border border-line bg-card px-4 py-2 text-sm">{row.name_ar} · {row.label} · {row.site_name}</li>)}
        </ul>
      ) : <p className="mt-4 text-sm text-ink/70">لا توجد توجيهات ميدانية اليوم.</p>}
    </div>
  );
}

function HrHome({ companyId }: { companyId: string }) {
  const employees = Number(one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE company_id = ? AND status = 'ACTIVE' AND role != 'TECH_ADMIN'", companyId)?.n ?? 0);
  const leaves = Number(one<{ n: number }>("SELECT COUNT(*) AS n FROM leave_requests WHERE company_id = ?", companyId)?.n ?? 0);
  return (
    <div className="mt-6 max-w-xl">
      <h2 className="font-semibold">عمل الموارد البشرية</h2>
      <p className="mt-2 text-sm leading-7 text-ink/70">المسير يستقبل نتيجة الحضور والغياب والإجازة بعد اعتماد مدير الأمن. الموارد البشرية لا تعتمد الإجازة.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card px-4 py-3"><p className="text-sm text-ink/70">الموظفون</p><p className="mt-1 text-2xl font-semibold">{employees}</p></div>
        <div className="rounded-2xl border border-line bg-card px-4 py-3"><p className="text-sm text-ink/70">طلبات الإجازة</p><p className="mt-1 text-2xl font-semibold">{leaves}</p></div>
      </div>
    </div>
  );
}
