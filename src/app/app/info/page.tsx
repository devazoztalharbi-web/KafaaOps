import { controls, frameworks, standard } from "@/lib/compliance";

export default function InfoPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">معلومات البناء</h1>
      <p className="mt-2 max-w-2xl leading-7 text-ink/75">ما يراعيه النظام في بنائه. هذه صفحة داخل التطبيق، وليست واجهة الدخول.</p>

      <h2 className="mt-8 text-lg font-semibold">ما يعمله النظام</h2>
      <ul className="mt-3 space-y-3">
        {standard.map((item) => (
          <li key={item.ar} className="rounded-2xl border border-line bg-card px-4 py-3 leading-7">{item.ar}</li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">الأنظمة التي يراعيها البناء</h2>
      <ul className="mt-3 space-y-3">
        {frameworks.map((item) => (
          <li key={item.code} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-xs font-semibold text-teal">{item.code}</p>
            <p className="mt-1 font-semibold">{item.titleAr}</p>
            <p className="mt-1 text-sm leading-6 text-ink/75">{item.bodyAr}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">الضوابط داخل التطبيق</h2>
      <ul className="mt-3 space-y-3">
        {controls.map((item) => (
          <li key={item.ar} className="rounded-2xl border border-line bg-card px-4 py-3 leading-7">{item.ar}</li>
        ))}
      </ul>

      <p className="mt-8 max-w-2xl text-sm leading-6 text-ink/60">مراعاة في البناء، ليست شهادة اعتماد. الاستضافة داخل المملكة واختبار الاختراق المستقل يكتملان عند التشغيل التجاري.</p>
    </section>
  );
}
