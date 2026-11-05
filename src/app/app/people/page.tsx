import { many } from "@/lib/db";
import { canApproveJoin, listPending } from "@/lib/join";
import { currentUser, reviewJoinAction } from "@/server/actions";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  const query = await searchParams;
  if (!user?.companyId || !canApproveJoin(user)) return <p>قبول الموظفين للتقني، أو لمن منحه التقني هذه الصلاحية.</p>;
  const pending = listPending(user);
  const sites = many<{ id: string; name_ar: string }>("SELECT id, name_ar FROM sites WHERE company_id = ? AND kind = 'SITE' AND active = 1", user.companyId);
  const supervisors = many<{ id: string; name_ar: string }>("SELECT id, name_ar FROM users WHERE company_id = ? AND role = 'SUPERVISOR' AND status = 'ACTIVE'", user.companyId);
  const staff = user.role === "TECH_ADMIN"
    ? many<{ id: string; name_ar: string }>("SELECT id, name_ar FROM users WHERE company_id = ? AND status = 'ACTIVE' AND id != ? ORDER BY name_ar", user.companyId, user.id)
    : [];
  return (
    <section>
      <h1 className="text-2xl font-semibold">طلبات الانضمام</h1>
      {query.e ? <p className="mt-3 text-sm">{query.e === "ok" ? "تم تنفيذ الإجراء." : `تعذر التنفيذ: ${query.e}`}</p> : null}
      <ul className="mt-4 space-y-4">
        {pending.map((person) => (
          <li key={person.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">{person.name_ar}</p>
            <p className="text-sm text-ink/70">{person.email}</p>
            <form action={reviewJoinAction} className="mt-3 grid gap-2 md:grid-cols-4">
              <input type="hidden" name="userId" value={person.id} />
              <select name="siteId" className="rounded-xl border border-line px-3 py-2">{sites.map((site) => <option key={site.id} value={site.id}>{site.name_ar}</option>)}</select>
              <select name="shiftNo" className="rounded-xl border border-line px-3 py-2"><option value="1">الوردية 1</option><option value="2">الوردية 2</option><option value="3">الوردية 3</option></select>
              <select name="managerId" className="rounded-xl border border-line px-3 py-2">{supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name_ar}</option>)}</select>
              <div className="flex gap-2">
                <button name="mode" value="approve" className="rounded-xl bg-teal px-3 py-2 text-white" type="submit">قبول</button>
                <button name="mode" value="reject" className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">رفض</button>
              </div>
            </form>
          </li>
        ))}
      </ul>
      {!pending.length ? <p className="mt-4 text-sm">لا توجد طلبات معلّقة.</p> : null}
      {staff.length ? (
        <div className="mt-8">
          <h2 className="font-semibold">منح قبول الموظفين</h2>
          <ul className="mt-3 space-y-2">
            {staff.map((person) => (
              <li key={person.id} className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-2 text-sm">
                <span>{person.name_ar}</span>
                <form action={reviewJoinAction}>
                  <input type="hidden" name="userId" value={person.id} />
                  <button name="mode" value="grant" className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">منح القبول</button>
                  <button name="mode" value="revoke" className="ms-2 rounded-xl border border-line px-3 py-2" type="submit">سحب</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
