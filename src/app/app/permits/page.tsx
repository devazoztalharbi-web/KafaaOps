import { listBans, listPermits } from "@/lib/field";
import { banAction, currentUser, permitAction } from "@/server/actions";

const decisionLabel: Record<string, string> = {
  ALLOWED: "تم السماح له",
  REFUSED: "تم منع الدخول",
  INFORMED: "تم إبلاغه",
};

export default async function PermitsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  const query = await searchParams;
  if (!user?.companyId) return null;
  const permits = listPermits(user);
  const bans = listBans(user);
  const canCheck = ["GUARD", "SUPERVISOR", "SECURITY_MANAGER"].includes(user.role);
  const canBan = user.role === "SECURITY_MANAGER" || user.role === "TECH_ADMIN";
  return (
    <section>
      <h1 className="text-2xl font-semibold">التصاريح</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/70">بعد الاطلاع على الورقة والتأكد أنها سارية، صوّرها من الجوال واختر النتيجة. الصورة تظهر للمشرفين والزملاء. قائمة المنع تبقى كتابة كما هي.</p>
      {query.e ? <p className="mt-3 text-sm">{query.e === "ok" ? "تم حفظ التصريح." : `تعذر الحفظ: ${query.e}`}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {canCheck ? (
          <form action={permitAction} className="space-y-2 rounded-2xl border border-line bg-card p-4">
            <h2 className="font-semibold">تصوير التصريح</h2>
            <select name="decision" required className="w-full rounded-xl border border-line px-3 py-2">
              <option value="ALLOWED">تم السماح له</option>
              <option value="REFUSED">تم منع الدخول</option>
              <option value="INFORMED">تم إبلاغه</option>
            </select>
            <textarea name="note" placeholder="عند الإبلاغ: مثلاً تبدأ الصيانة بعد ساعة" className="w-full rounded-xl border border-line px-3 py-2" />
            <input name="photo" type="file" accept="image/jpeg,image/png" capture="environment" required className="text-sm" />
            <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">إرفاق التصريح</button>
          </form>
        ) : null}
        {canBan ? (
          <form action={banAction} className="space-y-2 rounded-2xl border border-line bg-card p-4">
            <h2 className="font-semibold">إضافة للقائمة</h2>
            <input name="name" required placeholder="اسم المحل" className="w-full rounded-xl border border-line px-3 py-2" />
            <input name="registrationNo" required placeholder="رقم السجل" className="w-full rounded-xl border border-line px-3 py-2" />
            <input name="reason" required placeholder="سبب المنع" className="w-full rounded-xl border border-line px-3 py-2" />
            <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">حفظ في قائمة المنع</button>
          </form>
        ) : null}
      </div>
      {bans.length ? (
        <ul className="mt-4 space-y-2">
          {bans.map((ban) => <li key={ban.registration_no} className="rounded-xl border border-line bg-card px-4 py-2 text-sm">{ban.name_ar} · {ban.registration_no} · {ban.reason}</li>)}
        </ul>
      ) : null}
      <ul className="mt-6 space-y-3">
        {permits.map((permit) => (
          <li key={permit.id} className="rounded-2xl border border-line bg-card p-4 text-sm">
            <p className="font-semibold">{permit.decision ? decisionLabel[permit.decision] ?? permit.decision : permit.shop_name}</p>
            <p className="text-ink/70">{permit.name_ar}{permit.employee_no ? ` · ${permit.employee_no}` : ""}</p>
            {permit.note ? <p className="mt-1">{permit.note}</p> : null}
            {permit.photo_path ? <img src={`/app/media?kind=permit&id=${permit.id}`} alt="صورة التصريح" className="mt-3 max-h-72 rounded-xl" /> : <p className="mt-1">{permit.registration_no} · حتى {permit.valid_until}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
