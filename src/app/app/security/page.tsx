import { companyChains } from "@/lib/ops";
import { can } from "@/lib/auth";
import { currentUser } from "@/server/actions";

export default async function SecurityPage() {
  const user = await currentUser();
  if (!user?.companyId || !can(user, "audit")) {
    return <p>فحص السجل متاح للمسؤول التقني ومدير الأمن والموارد البشرية.</p>;
  }
  const chains = companyChains(user.companyId);
  const rows = [
    ["سجل الحضور", chains.punches],
    ["سجل التدقيق", chains.audit],
    ["قرارات الإجازة", chains.leaves],
  ] as const;
  return (
    <section>
      <h1 className="text-2xl font-semibold">فحص السجل</h1>
      <p className="mt-2 max-w-2xl leading-7">إعادة حساب سلسلة كل سجل. أي تعديل مباشر على الصف يفشل الفحص.</p>
      <ul className="mt-5 space-y-3">
        {rows.map(([label, result]) => (
          <li key={label} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">{label}</p>
            <p className="text-sm">{result.ok ? "السلسلة سليمة" : "السلسلة مكسورة"} · فُحص {result.checked} من {result.total}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
