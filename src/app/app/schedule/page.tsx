import { many } from "@/lib/db";
import { movement } from "@/lib/payroll";
import { scheduleAction } from "@/server/actions";
import { currentUser } from "@/server/actions";

const names = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ user?: string; e?: string }> }) {
  const actor = await currentUser();
  const query = await searchParams;
  if (!actor?.companyId || !["TECH_ADMIN", "SECURITY_MANAGER", "SUPERVISOR"].includes(actor.role)) {
    return <p>تعديل الجدول لمشرف الوردية ومدير الأمن والمسؤول التقني.</p>;
  }
  const people = many<{ id: string; name_ar: string; manager_id: string | null }>(
    "SELECT id, name_ar, manager_id FROM users WHERE company_id = ? AND role IN ('GUARD', 'SUPERVISOR') AND status = 'ACTIVE' ORDER BY name_ar",
    actor.companyId,
  ).filter((person) => actor.role !== "SUPERVISOR" || person.id === actor.id || person.manager_id === actor.id);
  const selected = people.find((person) => person.id === query.user) ?? people[0];
  const sheet = movement(actor.companyId);
  const row = sheet.rows.find((item) => item.id === selected?.id);
  return (
    <section>
      <h1 className="text-2xl font-semibold">جدول الدوام</h1>
      <p className="mt-2 text-sm text-ink/70">الأسبوع يبدأ السبت. الفترة الحالية من {sheet.period.start} إلى {sheet.period.end}. ملف إكسل يُحفظ CSV: التاريخ ثم DUTY أو REST.</p>
      {query.e ? <p className="mt-3 text-sm">{query.e === "ok" ? "تم حفظ الجدول." : "تعذر حفظ الجدول."}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {people.map((person) => (
          <a key={person.id} href={`/app/schedule?user=${person.id}`} className={`rounded-xl px-3 py-2 text-sm ${person.id === selected?.id ? "bg-ink text-paper" : "bg-card"}`}>{person.name_ar}</a>
        ))}
      </div>
      {selected && row ? (
        <form action={scheduleAction} className="mt-4 space-y-3">
          <input type="hidden" name="userId" value={selected.id} />
          {sheet.weeks.map((week, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 md:grid-cols-7">
              {week.map((date, day) => (
                <label key={`${index}-${day}`} className="rounded-xl border border-line bg-card p-2 text-sm">
                  <span className="block text-ink/70">{names[day]}</span>
                  {date ? (
                    <>
                      <span className="font-medium">{date.slice(5)}</span>
                      <select name={`day:${date}`} defaultValue={row.days[date] === "REST" ? "REST" : "DUTY"} className="mt-1 w-full bg-transparent">
                        <option value="DUTY">دوام</option>
                        <option value="REST">راحة</option>
                      </select>
                    </>
                  ) : <span className="block h-10" />}
                </label>
              ))}
            </div>
          ))}
          <input name="csv" type="file" accept=".csv,text/csv" className="block text-sm" />
          <button className="rounded-xl bg-ink px-4 py-2 text-paper" type="submit">حفظ الجدول</button>
        </form>
      ) : null}
    </section>
  );
}
