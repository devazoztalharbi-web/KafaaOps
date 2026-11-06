"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { controls, frameworks, standard, type Locale } from "@/lib/compliance";
import { developer } from "@/lib/developer";

type Slide = { kicker: string; title: string; body: string };

function slidesFor(locale: Locale): Slide[] {
  const ar = locale === "ar";
  return [
    {
      kicker: ar ? "التشغيل" : "Operations",
      title: ar ? "من باب الموقع إلى مسير الراتب" : "From the site gate to the payroll run",
      body: ar ? standard[0].ar : standard[0].en,
    },
    {
      kicker: ar ? "الدليل" : "Evidence",
      title: ar ? "السجل يُفتح عند النزاع" : "The record opens in a dispute",
      body: ar ? standard[1].ar : standard[1].en,
    },
    {
      kicker: ar ? "الإجازة" : "Leave",
      title: ar ? "المشرف ثم مدير الأمن" : "Supervisor, then the security manager",
      body: ar ? standard[3].ar : standard[3].en,
    },
    {
      kicker: ar ? "الأدوار" : "Roles",
      title: ar ? "كل منصب يرى عمله" : "Each post sees its own work",
      body: ar ? controls[3].ar : controls[3].en,
    },
    {
      kicker: ar ? "البصمة" : "Face",
      title: ar ? "المطابقة على الخادم" : "Matching stays on the server",
      body: ar ? `${controls[7].ar} ${controls[1].ar}` : `${controls[7].en} ${controls[1].en}`,
    },
    {
      kicker: ar ? "البناء" : "The build",
      title: ar ? "الأنظمة التي يراعيها البناء" : "Regimes the build observes",
      body: frameworks.map((item) => `${item.code}: ${ar ? item.titleAr : item.titleEn}`).join(ar ? " · " : " · "),
    },
  ];
}

export function HomeScreen() {
  const [locale, setLocale] = useState<Locale>("ar");
  const [index, setIndex] = useState(0);
  const [forward, setForward] = useState(true);
  const [paused, setPaused] = useState(false);
  const ar = locale === "ar";
  const slides = slidesFor(locale);
  const slide = slides[index];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = ar ? "rtl" : "ltr";
  }, [locale, ar]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setForward(true);
      setIndex((current) => (current + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  function step(direction: 1 | -1) {
    setForward(direction === 1);
    setIndex((current) => (current + direction + slides.length) % slides.length);
  }

  const from = forward ? (ar ? "-1.75rem" : "1.75rem") : ar ? "1.75rem" : "-1.75rem";

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-ink text-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-xs tracking-[0.18em] text-copper">KafaaOps</p>
            <p className="text-lg font-semibold">{ar ? "كفاءة أوبس" : "KafaaOps"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/enter" className="inline-flex items-center gap-2 rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink">
              <DoorIcon />
              {ar ? "تسجيل الدخول" : "Sign in"}
            </Link>
            <Link href="/join" className="inline-flex items-center gap-2 rounded-full border border-paper/40 px-4 py-2 text-sm font-semibold text-paper">
              <PersonIcon />
              {ar ? "تسجيل حساب" : "Create account"}
            </Link>
            <div className="flex rounded-full bg-white/10 p-1 text-sm">
              <button type="button" onClick={() => setLocale("ar")} className={`rounded-full px-3 py-1 ${ar ? "bg-paper text-ink" : "text-paper"}`}>
                العربية
              </button>
              <button type="button" onClick={() => setLocale("en")} className={`rounded-full px-3 py-1 ${ar ? "text-paper" : "bg-paper text-ink"}`}>
                English
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-sm text-copper">{ar ? developer.roleAr : developer.roleEn}</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold leading-tight">
          {ar ? "كفاءة أوبس: تشغيل أفراد شركات الحراسة." : "KafaaOps: running a security company's people."}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-ink/80">
          {ar ? developer.nameAr : developer.nameEn}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/enter" className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-paper">
            <DoorIcon />
            {ar ? "تسجيل الدخول" : "Sign in"}
          </Link>
          <Link href="/join" className="inline-flex items-center gap-2 rounded-2xl border border-ink px-5 py-3">
            <PersonIcon />
            {ar ? "تسجيل حساب" : "Create account"}
          </Link>
        </div>

        <section
          className="mt-10"
          aria-roledescription="carousel"
          aria-label={ar ? "تعريف بالنظام" : "About the system"}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="overflow-hidden rounded-3xl border border-line bg-card">
            <div
              key={`${locale}-${index}-${forward ? "f" : "b"}`}
              className="kafaa-slide px-6 py-8 sm:px-10"
              style={{ ["--slide-from" as string]: from }}
            >
              <p className="text-xs font-semibold tracking-[0.16em] text-teal">{slide.kicker}</p>
              <h2 className="mt-2 text-2xl font-semibold">{slide.title}</h2>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-ink/80">{slide.body}</p>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <button type="button" onClick={() => step(-1)} className="rounded-full border border-line px-4 py-2 text-sm" aria-label={ar ? "السابق" : "Previous"}>
                {ar ? "السابق" : "Previous"}
              </button>
              <div className="flex gap-2" aria-hidden="true">
                {slides.map((item, dot) => (
                  <span key={item.title} className={`h-2 w-2 rounded-full ${dot === index ? "bg-teal" : "bg-line"}`} />
                ))}
              </div>
              <button type="button" onClick={() => step(1)} className="rounded-full border border-line px-4 py-2 text-sm" aria-label={ar ? "التالي" : "Next"}>
                {ar ? "التالي" : "Next"}
              </button>
            </div>
          </div>
        </section>

        <p className="mt-6 max-w-3xl text-sm leading-6 text-ink/60">
          {ar
            ? "مراعاة في البناء، ليست شهادة اعتماد. الاستضافة داخل المملكة واختبار الاختراق المستقل يكتملان عند التشغيل التجاري."
            : "Built with these controls in mind. This is not an accreditation. In-Kingdom hosting and an independent penetration test are completed at commercial go-live."}
        </p>
      </main>
    </div>
  );
}

function DoorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3H15v18H5Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 7h2.5A1.5 1.5 0 0 1 19 8.5V21H15" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 12h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 19c.6-2.8 2.7-4 5.5-4s4.9 1.2 5.5 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18 8v6M15 11h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
