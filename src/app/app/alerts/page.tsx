import { listAlertClosers } from "@/lib/field";
import { grantAlertAction, raiseAlertAction, currentUser } from "@/server/actions";

export default async function AlertsPage() {
  const user = await currentUser();
  if (!user) return null;
  const canRaise = user.role === "GUARD" || user.role === "SUPERVISOR";
  return (
    <section>
      <h1 className="text-2xl font-semibold">بلاغ طارئ</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/70">مضاربة أو مشكلة أمنية تظهر لكل جهاز فاتح النظام. إقفال الإنذار للمشرف، ولمن يمنحه التقني هذه الصلاحية. تنبيه الجوال وهو مغلق يحتاج تطبيق أندرويد لاحقاً.</p>
      {canRaise ? (
        <form action={raiseAlertAction} className="mt-4 max-w-xl space-y-3 rounded-2xl border border-line bg-card p-4">
          <select name="kind" className="w-full rounded-xl border border-line px-3 py-2">
            <option value="FIGHT">مضاربة</option>
            <option value="SECURITY">مشكلة أمنية</option>
          </select>
          <textarea name="body" required minLength={5} placeholder="وصف مختصر للموقع وما يحدث" className="w-full rounded-xl border border-line px-3 py-2" />
          <button className="rounded-xl bg-red-700 px-3 py-2 text-white" type="submit">رفع البلاغ الآن</button>
        </form>
      ) : <p className="mt-4 text-sm">رفع البلاغ الطارئ للحارس والمشرف. إقفال الإنذار من الشريط الأحمر لمن يملك الصلاحية.</p>}
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
