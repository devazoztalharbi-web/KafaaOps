import { listBans, listPermits } from "@/lib/field";
import { banAction, currentUser, permitAction } from "@/server/actions";

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
      <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/70">الفحص محلي: قائمة المنع التي تدخلها الشركة، وتاريخ انتهاء التصريح بوقت الخادم. هذا ليس اتصالاً بسجل حكومي.</p>
      {query.e ? <p className="mt-3 text-sm">{query.e === "ok" ? "التصريح سليم." : query.e === "banned" ? "المحل في قائمة المنع." : query.e === "expired" ? "التصريح منتهٍ." : query.e === "both" ? "المحل ممنوع، والتصريح منتهٍ." : `تعذر الفحص: ${query.e}`}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {canCheck ? (
          <form action={permitAction} className="space-y-2 rounded-2xl border border-line bg-card p-4">
            <h2 className="font-semibold">فحص تصريح محل</h2>
            <input name="shopName" required placeholder="اسم المحل" className="w-full rounded-xl border border-line px-3 py-2" />
            <input name="registrationNo" required placeholder="رقم السجل" className="w-full rounded-xl border border-line px-3 py-2" />
            <input name="validUntil" type="date" required className="w-full rounded-xl border border-line px-3 py-2" />
            <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">فحص</button>
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
      <ul className="mt-6 space-y-2">
        {permits.map((permit) => (
          <li key={permit.id} className={`rounded-2xl px-4 py-3 text-sm ${permit.banned || permit.expired ? "bg-red-700 text-white" : "border border-line bg-card"}`}>
            {permit.shop_name} · {permit.registration_no} · حتى {permit.valid_until}
            {permit.banned ? " · قائمة المنع" : ""}
            {permit.expired ? " · منتهٍ" : ""}
            {!permit.banned && !permit.expired ? " · سليم" : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
