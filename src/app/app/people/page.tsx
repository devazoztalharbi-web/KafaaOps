import { many } from "@/lib/db";
import { canApproveJoin, listPending } from "@/lib/join";
import { roleTitle } from "@/lib/nav";
import { JoinReview } from "@/components/JoinReview";
import { currentUser, resetPasswordAction } from "@/server/actions";

const notes: Record<string, string> = {
  ok: "تم تنفيذ الإجراء.",
  err_password: "كلمة المرور ١٠ أحرف على الأقل، وفيها حرف ورقم.",
  err_join: "راجع الرقم الوظيفي والربط. الرقم لا يتكرر داخل الشركة.",
  err_file_type: "الصورة يجب أن تكون JPEG أو PNG.",
};

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  const query = await searchParams;
  if (!user?.companyId || !canApproveJoin(user)) return <p>قبول الموظفين للتقني، أو لمن منحه التقني هذه الصلاحية.</p>;
  const pending = listPending(user);
  const sites = many<{ id: string; name_ar: string }>("SELECT id, name_ar FROM sites WHERE company_id = ? AND kind IN ('COMPLEX', 'SITE') AND active = 1 ORDER BY name_ar", user.companyId);
  const managers = many<{ id: string; name_ar: string }>("SELECT id, name_ar FROM users WHERE company_id = ? AND role = 'SECURITY_MANAGER' AND status = 'ACTIVE'", user.companyId);
  const supervisors = many<{ id: string; name_ar: string; shift_no: number | null }>("SELECT id, name_ar, shift_no FROM users WHERE company_id = ? AND role = 'SUPERVISOR' AND status = 'ACTIVE'", user.companyId);
  const staff = user.role === "TECH_ADMIN"
    ? many<{ id: string; name_ar: string; role: "HR" | "SECURITY_MANAGER" | "SUPERVISOR" | "GUARD"; employee_no: string | null }>(
        "SELECT id, name_ar, role, employee_no FROM users WHERE company_id = ? AND status = 'ACTIVE' AND id != ? ORDER BY name_ar",
        user.companyId,
        user.id,
      )
    : [];
  return (
    <section>
      <h1 className="text-2xl font-semibold">طلبات الانضمام</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/70">الطلب يظهر بالاسم والبريد. اضغط قبول لتفتح خانات الرقم الوظيفي والمسمى والربط، والصورة اختيارية. الرفض يغلق الطلب.</p>
      {query.e ? <p className="mt-3 text-sm">{notes[query.e] ?? `تعذر التنفيذ: ${query.e}`}</p> : null}
      <ul className="mt-4 space-y-4">
        {pending.map((person) => (
          <JoinReview key={person.id} person={person} isTech={user.role === "TECH_ADMIN"} sites={sites} managers={managers} supervisors={supervisors} />
        ))}
      </ul>
      {!pending.length ? <p className="mt-4 text-sm">لا توجد طلبات معلّقة.</p> : null}

      {user.role === "TECH_ADMIN" ? (
        <div className="mt-10">
          <h2 className="font-semibold">كلمة مرور منسية</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/70">لا يوجد دخول بجوجل. إذا نسي الموظف كلمة المرور تكتب له كلمة جديدة من هنا، وتنتهي جلسته الحالية حتى يدخل بالكلمة الجديدة.</p>
          {staff.length ? (
            <ul className="mt-4 space-y-3">
              {staff.map((person) => (
                <li key={person.id} className="rounded-2xl border border-line bg-card p-4">
                  <p className="font-semibold">{person.name_ar}</p>
                  <p className="text-sm text-ink/70">{roleTitle[person.role]}{person.employee_no ? ` · ${person.employee_no}` : ""}</p>
                  <form action={resetPasswordAction} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="userId" value={person.id} />
                    <input name="password" type="password" required minLength={10} placeholder="كلمة المرور الجديدة" className="rounded-xl border border-line px-3 py-2" />
                    <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">حفظ الكلمة الجديدة</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm">لا يوجد موظفون نشطون بعد.</p>}
        </div>
      ) : null}
    </section>
  );
}