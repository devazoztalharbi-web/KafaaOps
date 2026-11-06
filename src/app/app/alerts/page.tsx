import { childReports, listAlertClosers } from "@/lib/field";
import { acknowledgeAction, grantAlertAction, raiseAlertAction, currentUser } from "@/server/actions";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  const query = await searchParams;
  if (!user?.companyId) return null;
  const canRaise = ["GUARD", "SUPERVISOR", "SECURITY_MANAGER", "HR", "TECH_ADMIN"].includes(user.role);
  const children = childReports(user.companyId);
  const canClose = user.role === "SUPERVISOR";
  return (
    <section>
      <h1 className="text-2xl font-semibold">البلاغات</h1>
      {query.e ? <p className="mt-3 text-sm">{query.e === "ok" ? "تم حفظ البلاغ." : `تعذر الحفظ: ${query.e}`}</p> : null}
      {canRaise ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <form action={raiseAlertAction} className="space-y-3 rounded-2xl border border-line bg-card p-4">
            <h2 className="font-semibold">طفل ضائع</h2>
            <p className="text-sm leading-7 text-ink/70">بلا جرس. الصورة والمكان يظهران لكل الموظفين حتى يلتقي الطفل بأهله، أو يعرف الموظف أين يوجه الأهل.</p>
            <input type="hidden" name="kind" value="CHILD" />
            <textarea name="body" required minLength={5} placeholder="أين الطفل الآن، أو وصف من يبحث عنه" className="w-full rounded-xl border border-line px-3 py-2" />
            <input name="photo" type="file" accept="image/jpeg,image/png" capture="environment" required className="text-sm" />
            <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">رفع بلاغ الطفل</button>
          </form>
          <form action={raiseAlertAction} className="space-y-3 rounded-2xl border border-red-700 bg-card p-4">
            <h2 className="font-semibold">بلاغ طارئ</h2>
            <p className="text-sm leading-7 text-ink/70">يرن الجرس عند كل موظف، وتظهر بطاقة فيها رقمك الوظيفي حتى يتجه إليك الأمن.</p>
            <input type="hidden" name="kind" value="EMERGENCY" />
            <textarea name="body" required minLength={5} placeholder="ماذا يحدث وأين أنت" className="w-full rounded-xl border border-line px-3 py-2" />
            <input name="photo" type="file" accept="image/jpeg,image/png" capture="environment" required className="text-sm" />
            <button className="rounded-xl bg-red-700 px-3 py-2 text-white" type="submit">رفع البلاغ الطارئ</button>
          </form>
        </div>
      ) : null}
      <h2 className="mt-8 font-semibold">بلاغات الأطفال</h2>
      <ul className="mt-3 space-y-3">
        {children.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line bg-card p-4 text-sm">
            <p className="font-semibold">{row.name_ar}{row.employee_no ? ` · ${row.employee_no}` : ""}</p>
            <p className="mt-1">{row.body}</p>
            {row.photo_path ? <img src={`/app/media?kind=alert&id=${row.id}`} alt="صورة بلاغ الطفل" className="mt-3 max-h-72 rounded-xl" /> : null}
            {row.status === "ACK" ? <p className="mt-2 text-ink/70">تم الربط مع الأهل.</p> : null}
            {canClose && row.status === "OPEN" ? (
              <form action={acknowledgeAction} className="mt-3">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="back" value="/app/alerts" />
                <button className="rounded-xl border border-line px-3 py-2" type="submit">تم الربط مع الأهل</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {!children.length ? <p className="mt-3 text-sm">لا توجد بلاغات أطفال.</p> : null}
      {user.role === "TECH_ADMIN" ? (
        <ul className="mt-8 space-y-2">
          {listAlertClosers(user).map((person) => (
            <li key={person.id} className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 text-sm">
              <span>{person.name_ar}</span>
              <form action={grantAlertAction}>
                <input type="hidden" name="userId" value={person.id} />
                <input type="hidden" name="mode" value={person.granted ? "revoke" : "grant"} />
                <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">{person.granted ? "سحب إقفال الإنذار" : "منح إقفال الإنذار"}</button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
