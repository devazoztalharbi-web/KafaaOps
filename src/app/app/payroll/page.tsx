import { can } from "@/lib/auth";
import { movement, type DayMark } from "@/lib/payroll";
import { currentUser } from "@/server/actions";

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

export default async function PayrollPage() {
  const user = await currentUser();
  if (!user?.companyId || !can(user, "payroll")) return <p>مسير الحركة متاح للموارد البشرية ومدير الأمن والمسؤول التقني.</p>;
  const sheet = movement(user.companyId);
  return (
    <section>
      <h1 className="text-2xl font-semibold">مسير الحركة</h1>
      <p className="mt-2 text-sm text-ink/70">من {sheet.period.start} إلى {sheet.period.end}. يوم الراحة ليس غياباً، ويوم الدوام بلا حضور يصبح غياباً بعد نهاية الوردية.</p>
      <p className="mt-2 text-sm">ح حاضر · ت متأخر · غ غياب · ر راحة · إ إجازة · · الوردية لم تغلق</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="min-w-max border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="sticky right-0 bg-card px-3 py-2 text-right">الموظف</th>
              {sheet.dates.map((date) => (
                <th key={date} className="px-1 py-2 font-normal">{date.slice(8)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <th className="sticky right-0 bg-card px-3 py-2 text-right font-medium">{row.name_ar}</th>
                {sheet.dates.map((date) => (
                  <td key={date} className="p-1">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded ${tone[row.days[date]]}`}>{label[row.days[date]]}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
