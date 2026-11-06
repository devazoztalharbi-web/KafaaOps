import { many } from "@/lib/db";
import { canApproveJoin, listPending } from "@/lib/join";
import { currentUser, reviewJoinAction } from "@/server/actions";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  const query = await searchParams;
  if (!user?.companyId || !canApproveJoin(user)) return <p>قبول الموظفين للتقني، أو لمن منحه التقني هذه الصلاحية.</p>;
  const pending = listPending(user);
  const sites = many<{ id: string; name_ar: string }>("SELECT id, name_ar FROM sites WHERE company_id = ? AND kind IN ('COMPLEX', 'SITE') AND active = 1 ORDER BY name_ar", user.companyId);
  const managers = many<{ id: string; name_ar: string }>("SELECT id, name_ar FROM users WHERE company_id = ? AND role = 'SECURITY_MANAGER' AND status = 'ACTIVE'", user.companyId);
  const supervisors = many<{ id: string; name_ar: string; shift_no: number | null }>("SELECT id, name_ar, shift_no FROM users WHERE company_id = ? AND role = 'SUPERVISOR' AND status = 'ACTIVE'", user.companyId);
  return (
    <section>
      <h1 className="text-2xl font-semibold">طلبات الانضمام</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/70">فعّل مدير الأمن أولاً واربطه بالموقع. ثم المشرف وورديته ومدير الأمن. الحارس يأخذ وردية مشرفه. الموارد البشرية بلا موقع ولا وردية.</p>
      {query.e ? <p className="mt-3 text-sm">{query.e === "ok" ? "تم تنفيذ الإجراء." : `تعذر التنفيذ: ${query.e}`}</p> : null}
      <ul className="mt-4 space-y-4">
        {pending.map((person) => (
          <li key={person.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">{person.name_ar}</p>
            <p className="text-sm text-ink/70">{person.email}</p>
            <form action={reviewJoinAction} className="mt-3 grid gap-2 md:grid-cols-2">
              <input type="hidden" name="userId" value={person.id} />
              {user.role === "TECH_ADMIN" ? (
                <label className="text-sm">المنصب
                  <select name="role" className="mt-1 w-full rounded-xl border border-line px-3 py-2">
                    <option value="SECURITY_MANAGER">مدير الأمن</option>
                    <option value="SUPERVISOR">المشرف</option>
                    <option value="GUARD">الحارس</option>
                    <option value="HR">الموارد البشرية</option>
                  </select>
                </label>
              ) : <input type="hidden" name="role" value="GUARD" />}
              <label className="text-sm">الموقع
                <select name="siteId" className="mt-1 w-full rounded-xl border border-line px-3 py-2">{sites.map((site) => <option key={site.id} value={site.id}>{site.name_ar}</option>)}</select>
              </label>
              <label className="text-sm">وردية المشرف
                <select name="shiftNo" className="mt-1 w-full rounded-xl border border-line px-3 py-2"><option value="1">الوردية 1</option><option value="2">الوردية 2</option><option value="3">الوردية 3</option></select>
              </label>
              <label className="text-sm">الربط
                <select name="managerId" className="mt-1 w-full rounded-xl border border-line px-3 py-2">
                  <optgroup label="مدير الأمن">{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name_ar}</option>)}</optgroup>
                  <optgroup label="المشرف">{supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name_ar} · وردية {supervisor.shift_no}</option>)}</optgroup>
                </select>
              </label>
              <div className="flex gap-2">
                <button name="mode" value="approve" className="rounded-xl bg-teal px-3 py-2 text-white" type="submit">قبول</button>
                <button name="mode" value="reject" className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">رفض</button>
              </div>
            </form>
          </li>
        ))}
      </ul>
      {!pending.length ? <p className="mt-4 text-sm">لا توجد طلبات معلّقة.</p> : null}
    </section>
  );
}
