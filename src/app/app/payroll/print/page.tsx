import { PrintButton } from "@/components/PrintButton";
import { canOpenPayroll, lateLabel, movement, projectGroups } from "@/lib/payroll";
import { currentUser } from "@/server/actions";
import type { DayMark } from "@/lib/payroll";

const label: Record<DayMark, string> = {
  PRESENT: "حاضر",
  LATE: "متأخر",
  ABSENT: "غياب",
  REST: "راحة",
  LEAVE: "إجازة",
  OPEN: "لم تغلق",
  UNSET: "—",
};

export default async function PayrollPrintPage() {
  const user = await currentUser();
  if (!user?.companyId || !canOpenPayroll(user)) return null;
  const sheet = movement(user.companyId);
  const rows = user.role === "GUARD"
    ? sheet.rows.filter((row) => row.id === user.id)
    : user.role === "SUPERVISOR"
      ? sheet.rows.filter((row) => row.id === user.id || row.manager_id === user.id)
      : sheet.rows;
  return (
    <section>
      <div className="flex items-center justify-between gap-3 print:block">
        <div>
          <h1 className="text-2xl font-semibold">مسير الحركة</h1>
          <p className="mt-1 text-sm">من {sheet.period.start} إلى {sheet.period.end}</p>
        </div>
        <PrintButton />
      </div>
      <p className="mt-3 text-sm print:hidden">من نافذة الطباعة اختر «حفظ كـ PDF».</p>
      {projectGroups(rows).map((group) => (
        <section key={group.id || "none"} className="mt-6">
          <h2 className="font-semibold">{group.name}</h2>
          <p className="text-sm">{group.incentive || "بدون حافز مكتوب"}</p>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-line px-2 py-1 text-right">الموظف</th>
                <th className="border border-line px-2 py-1">أيام الغياب</th>
                <th className="border border-line px-2 py-1">ساعات التأخير</th>
                {sheet.dates.map((date) => <th key={date} className="border border-line px-1 py-1 font-normal">{date.slice(8)}</th>)}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-line px-2 py-1">{row.name_ar}</td>
                  <td className="border border-line px-2 py-1 text-center">{row.absent}</td>
                  <td className="border border-line px-2 py-1 text-center">{lateLabel(row.lateMinutes)}</td>
                  {sheet.dates.map((date) => <td key={date} className="border border-line px-1 py-1 text-center">{label[row.days[date].mark]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </section>
  );
}
