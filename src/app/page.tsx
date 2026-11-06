import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="w-full max-w-sm text-center">
        <p className="text-xs tracking-[0.18em] text-copper">KafaaOps</p>
        <h1 className="mt-2 text-3xl font-semibold">كفاءة أوبس</h1>
        <div className="mt-8 flex flex-col gap-3">
          <Link href="/enter" className="rounded-2xl bg-ink px-4 py-3 text-paper">تسجيل الدخول</Link>
          <Link href="/join" className="rounded-2xl border border-ink px-4 py-3">تسجيل حساب</Link>
        </div>
      </div>
    </main>
  );
}
