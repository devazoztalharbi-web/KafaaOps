"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { controls, frameworks, standard, type Locale } from "@/lib/compliance";
import { developer } from "@/lib/developer";

export function HomeScreen() {
  const [locale, setLocale] = useState<Locale>("ar");
  const ar = locale === "ar";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = ar ? "rtl" : "ltr";
  }, [locale, ar]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-ink text-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-xs tracking-[0.18em] text-copper">KafaaOps</p>
            <p className="text-lg font-semibold">{ar ? "كفاءة أوبس" : "KafaaOps"}</p>
          </div>
          <div className="text-start">
            <p className="text-xs text-paper/70">{ar ? developer.roleAr : developer.roleEn}</p>
            <p className="text-base font-semibold">{ar ? developer.nameAr : developer.nameEn}</p>
          </div>
          <div className="flex rounded-full bg-white/10 p-1 text-sm">
            <button
              type="button"
              onClick={() => setLocale("ar")}
              className={`rounded-full px-3 py-1 ${ar ? "bg-paper text-ink" : "text-paper"}`}
            >
              العربية
            </button>
            <button
              type="button"
              onClick={() => setLocale("en")}
              className={`rounded-full px-3 py-1 ${ar ? "text-paper" : "bg-paper text-ink"}`}
            >
              English
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <p className="text-sm text-copper">{ar ? "معيار كفاءة أوبس" : "The KafaaOps standard"}</p>
        <h1 className="mt-1 max-w-3xl text-3xl font-semibold leading-tight">
          {ar ? "إثبات يصمد، من باب الموقع إلى مسير الراتب." : "Proof that holds, from the site gate to the payroll run."}
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink/80">
          {ar
            ? "ضوابط الهيئة ونظام حماية البيانات هي الأرضية. فوقها نبني النظام الذي تدافع به شركة الحراسة عن حضور الحارس وإجازته وراتبه."
            : "The national cybersecurity controls and the personal-data law are the floor. Above them we build the system a security company can defend: the guard's attendance, leave, and pay."}
        </p>
        <p className="mt-4 max-w-2xl leading-7">
          {ar
            ? "يبنيه كادر وطني. مع رؤية المملكة، التقنية الحضارية الآمنة التي تمنع التلاعب تُصنع هنا، ولا ينقصنا شيء."
            : "Built by a national cadre. With the Kingdom's vision, secure technology that prevents tampering is made here."}
        </p>
        <Link href="/enter" className="mt-5 inline-block rounded-xl bg-ink px-4 py-3 text-paper">دخول النظام</Link>
        <p className="mt-3 text-sm text-ink/70">
          {ar ? developer.roleAr : developer.roleEn}
          <span className="mx-2 text-copper">·</span>
          <span className="font-semibold text-ink">{ar ? developer.nameAr : developer.nameEn}</span>
        </p>

        <section className="mt-8 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-xl font-semibold">{ar ? "هذا هو التوب الذي نبنيه" : "This is the bar we build to"}</h2>
          <ul className="mt-4 space-y-3">
            {standard.map((item) => (
              <li key={item.en} className="flex gap-3 leading-7">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-copper" />
                <span>{ar ? item.ar : item.en}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-xl font-semibold">
            {ar ? "الأرضية: الأنظمة التي يراعيها البناء" : "The floor: the regimes the build observes"}
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {frameworks.map((item) => (
              <article key={item.code} className="rounded-xl border border-line p-4">
                <p className="text-xs font-semibold tracking-wide text-teal">{item.code}</p>
                <h3 className="mt-1 font-semibold">{ar ? item.titleAr : item.titleEn}</h3>
                <p className="mt-2 text-sm leading-6 text-ink/75">{ar ? item.bodyAr : item.bodyEn}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-xl font-semibold">
            {ar ? "الضوابط الموضوعة داخل التطبيق" : "Controls built into the application"}
          </h2>
          <ul className="mt-4 space-y-3">
            {controls.map((item) => (
              <li key={item.en} className="flex gap-3 leading-7">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-teal" />
                <span>{ar ? item.ar : item.en}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm leading-6 text-ink/60">
            {ar
              ? "هذه مراعاة في بناء النظام، وليست شهادة اعتماد صادرة من الهيئة الوطنية للأمن السيبراني. الاستضافة داخل المملكة واختبار الاختراق المستقل يكتملان عند التشغيل التجاري."
              : "This describes how the system is built. It is not an accreditation certificate from the National Cybersecurity Authority. In-Kingdom hosting and an independent penetration test are completed at commercial go-live."}
          </p>
        </section>
      </main>
    </div>
  );
}
