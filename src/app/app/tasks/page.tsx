import { many } from "@/lib/db";
import { visibleTasks } from "@/lib/tasks";
import { currentUser, taskAction } from "@/server/actions";

const statusLabel: Record<string, string> = {
  OPEN: "مفتوحة",
  SUBMITTED: "بانتظار المشرف",
  CLOSED: "مغلقة",
  CANCELLED: "ملغاة",
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const actor = await currentUser();
  const query = await searchParams;
  if (!actor?.companyId) return null;
  const tasks = visibleTasks(actor);
  const canAssign = ["SUPERVISOR", "SECURITY_MANAGER", "TECH_ADMIN"].includes(actor.role);
  const guards = canAssign
    ? many<{ id: string; name_ar: string; manager_id: string | null }>(
        "SELECT id, name_ar, manager_id FROM users WHERE company_id = ? AND role = 'GUARD' AND status = 'ACTIVE' ORDER BY name_ar",
        actor.companyId,
      ).filter((guard) => actor.role !== "SUPERVISOR" || guard.manager_id === actor.id)
    : [];
  const sites = canAssign
    ? many<{ id: string; name_ar: string }>("SELECT id, name_ar FROM sites WHERE company_id = ? AND kind = 'SITE' AND active = 1 ORDER BY name_ar", actor.companyId)
    : [];
  const staff = ["TECH_ADMIN", "SECURITY_MANAGER"].includes(actor.role)
    ? many<{ id: string; name_ar: string }>(
        "SELECT id, name_ar FROM users WHERE company_id = ? AND status = 'ACTIVE' AND role IN ('GUARD', 'SUPERVISOR', 'HR') ORDER BY name_ar",
        actor.companyId,
      )
    : [];
  return (
    <section>
      <h1 className="text-2xl font-semibold">المهام الميدانية</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/70">الموظف الذي عليه مهمة مفتوحة أو بانتظار الاعتماد لا يمكن إيقافه.</p>
      {query.e ? <p className="mt-3 text-sm">{query.e === "ok" ? "تم تنفيذ الإجراء." : `تعذر التنفيذ: ${query.e}`}</p> : null}
      {canAssign ? (
        <form action={taskAction} className="mt-4 grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-4">
          <input type="hidden" name="mode" value="create" />
          <select name="guardId" className="rounded-xl border border-line px-3 py-2" required>
            {guards.map((guard) => <option key={guard.id} value={guard.id}>{guard.name_ar}</option>)}
          </select>
          <select name="siteId" className="rounded-xl border border-line px-3 py-2" required>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name_ar}</option>)}
          </select>
          <input name="dutyDate" type="date" required className="rounded-xl border border-line px-3 py-2" />
          <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">إسناد مهمة</button>
        </form>
      ) : null}
      <ul className="mt-6 space-y-3">
        {tasks.map((task) => (
          <li key={task.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">{task.guard_name} · {task.site_name}</p>
            <p className="text-sm">{task.duty_date} · {statusLabel[task.status] ?? task.status}</p>
            {task.rating ? <p className="text-sm">التقييم {task.rating} · {task.review_note}</p> : null}
            {actor.role === "GUARD" && task.status === "OPEN" ? (
              <form action={taskAction} className="mt-3">
                <input type="hidden" name="mode" value="submit" />
                <input type="hidden" name="id" value={task.id} />
                <button className="rounded-xl bg-teal px-3 py-2 text-white" type="submit">تسليم المهمة</button>
              </form>
            ) : null}
            {actor.role === "SUPERVISOR" && task.status === "SUBMITTED" ? (
              <form action={taskAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="mode" value="close" />
                <input type="hidden" name="id" value={task.id} />
                <input name="rating" type="number" min={1} max={5} required placeholder="1-5" className="w-20 rounded-xl border border-line px-3 py-2" />
                <input name="note" placeholder="ملاحظة" className="rounded-xl border border-line px-3 py-2" />
                <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">إغلاق</button>
              </form>
            ) : null}
            {actor.role === "SUPERVISOR" && task.status === "OPEN" ? (
              <form action={taskAction} className="mt-3">
                <input type="hidden" name="mode" value="cancel" />
                <input type="hidden" name="id" value={task.id} />
                <button className="text-sm underline" type="submit">إلغاء المهمة</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {staff.length ? (
        <form action={taskAction} className="mt-8 flex flex-wrap items-center gap-2">
          <input type="hidden" name="mode" value="suspend" />
          <select name="userId" className="rounded-xl border border-line bg-card px-3 py-2">
            {staff.map((person) => <option key={person.id} value={person.id}>{person.name_ar}</option>)}
          </select>
          <button className="rounded-xl border border-line px-3 py-2" type="submit">إيقاف</button>
        </form>
      ) : null}
    </section>
  );
}
