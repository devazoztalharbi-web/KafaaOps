import Link from "next/link";
import { issuePayrollAction } from "@/server/actions";
import { canOpenPayroll, lateLabel, movement, payrollRequests } from "@/lib/payroll";
import { currentUser } from "@/server/actions";
import type { DayMark } from "@/lib/payroll";

const label: Record<DayMark, string> = {
  PRESENT: "ح",
  LATE: "ت",
  ABSENT: "غ",
  REST: "ر",
  LEAVE: "إ",
  OPEN: "·",
  UNSET: "",
};

const tone: Record<DayMark, string> = {
  PRESENT: "bg-teal text-white",
  LATE: "bg-copper text-white",
  ABSENT: "bg-red-700 text-white",
  REST: "bg-line text-ink",
  LEAVE: "bg-sky-700 text-white",
  OPEN: "bg-card text-ink",
  UNSET: "bg-card text-ink",
};

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  const query = await searchParams;
  if (!user?.companyId || !canOpenPayroll(user)) return <p>مسير الحركة يظهر لفرد الأمن بعد إصداره. المشرف والموارد ومدير الأمن والتقني يفتحونه من هنا.</p>;
  const sheet = movement(user.companyId);
  const rows = user.role === "GUARD"
    ? sheet.rows.filter((row) => row.id === user.id)
    : user.role === "SUPERVISOR"
      ? sheet.rows.filter((row) => row.id === user.id || row.manager_id === user.id)
      : sheet.rows;
  const requests = payrollRequests(user);
  return (
    <section>
      <h1 className="text-2xl font-semibold">{user.role === "SUPERVISOR" ? "مسييرات الوردية" : "مسير الحركة"}</h1>
      <p className="mt-2 text-sm text-ink/70">من {sheet.period.start} إلى {sheet.period.end}. يوم ٢٠ هو يوم المراجعة المعتاد، والطباعة متاحة في أي يوم قبله.</p>
      <p className="mt-2 text-sm">ح حاضر · ت متأخر · غ غياب · ر راحة · إ إجازة · · الوردية لم تغلق</p>
      {query.e === "ok" ? <p className="mt-3 text-sm">وصل المسير إلى الموظفين المطلوبين.</p> : null}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="min-w-max border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="sticky right-0 bg-card px-3 py-2 text-right">الموظف</th>
              <th className="px-2 py-2">أيام الغياب</th>
              <th className="px-2 py-2">ساعات التأخير</th>
              {sheet.dates.map((date) => (
                <th key={date} className="px-1 py-2 font-normal">{date.slice(8)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <th className="sticky right-0 bg-card px-3 py-2 text-right font-medium">{row.name_ar}</th>
                <td className="px-2 py-2">{row.absent}</td>
                <td className="px-2 py-2">{lateLabel(row.lateMinutes)}</td>
                {sheet.dates.map((date) => (
                  <td key={date} className="p-1">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded ${tone[row.days[date].mark]}`}>{label[row.days[date].mark]}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4"><Link href="/app/payroll/print" className="rounded-xl bg-ink px-3 py-2 text-paper">فتح التقرير للطباعة وحفظ PDF</Link></p>
      {user.role === "SUPERVISOR" || user.role === "TECH_ADMIN" || user.role === "SECURITY_MANAGER" || user.role === "HR" ? (
        <form action={issuePayrollAction} className="mt-6 rounded-2xl border border-line bg-card p-4">
          <h2 className="font-semibold">إصدار المسير للموظفين</h2>
          <p className="mt-2 text-sm leading-7 text-ink/70">الإصدار يفتح المسير لكل موظف تختاره. قبل الإصدار لا يظهر في قائمته.</p>
          {requests.length ? <p className="mt-2 text-sm">طلبات وصلت: {requests.map((person) => person.name_ar).join(" · ")}</p> : null}
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {rows.filter((row) => row.role === "GUARD").map((row) => (
              <label key={row.id} className="flex items-center gap-2">
                <input type="checkbox" name="userId" value={row.id} defaultChecked={requests.some((person) => person.id === row.id) || user.role === "SUPERVISOR"} />
                {row.name_ar}
              </label>
            ))}
          </div>
          <button className="mt-3 rounded-xl bg-teal px-3 py-2 text-white" type="submit">إصدار المسيرات المحددة</button>
        </form>
      ) : null}
    </section>
  );
}
