import { many } from "@/lib/db";
import { leaveState } from "@/lib/ops";
import { currentUser, decideAction, leaveAction } from "@/server/actions";

export default async function LeavesPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  const query = await searchParams;
  if (!user?.companyId) return null;
  const rows = many<{ id: string; user_id: string; type: string; start_date: string; end_date: string; reason: string }>(
    "SELECT id, user_id, type, start_date, end_date, reason FROM leave_requests WHERE company_id = ? ORDER BY created_at DESC",
    user.companyId,
  );
  const visible = rows.filter((row) => row.user_id === user.id || user.role !== "GUARD");
  return (
    <section>
      <h1 className="text-2xl font-semibold">الإجازات</h1>
      {query.e && query.e !== "ok" ? <p className="mt-3 text-sm">تعذر تنفيذ الطلب: {query.e}</p> : null}
      <form action={leaveAction} className="mt-4 grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-2">
        <select name="type" className="rounded-xl border border-line px-3 py-2">
          <option value="ANNUAL">سنوية</option>
          <option value="SICK">مرضية</option>
          <option value="UNPAID">بدون راتب</option>
        </select>
        <input name="reason" required placeholder="السبب" className="rounded-xl border border-line px-3 py-2" />
        <input name="start" type="date" required className="rounded-xl border border-line px-3 py-2" />
        <input name="end" type="date" required className="rounded-xl border border-line px-3 py-2" />
        <input name="file" type="file" accept="image/jpeg,image/png,application/pdf" className="md:col-span-2" />
        <button className="rounded-xl bg-ink px-3 py-2 text-paper md:col-span-2" type="submit">رفع الطلب</button>
      </form>
      <ul className="mt-6 space-y-3">
        {visible.map((row) => {
          const state = leaveState(row.id);
          return (
            <li key={row.id} className="rounded-2xl border border-line bg-card p-4">
              <p className="font-semibold">{row.type} · {state}</p>
              <p className="text-sm">{row.start_date} → {row.end_date}</p>
              <p className="text-sm text-ink/70">{row.reason}</p>
              {(state === "PENDING_SUPERVISOR" && user.role === "SUPERVISOR") || (state === "PENDING_MANAGER" && user.role === "SECURITY_MANAGER") ? (
                <form action={decideAction} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={row.id} />
                  <input name="note" placeholder="ملاحظة" className="rounded-xl border border-line px-3 py-2" />
                  <button name="decision" value="APPROVE" className="rounded-xl bg-teal px-3 py-2 text-white">اعتماد</button>
                  <button name="decision" value="REJECT" className="rounded-xl bg-ink px-3 py-2 text-paper">رفض</button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
