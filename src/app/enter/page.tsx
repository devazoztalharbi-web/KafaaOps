import Link from "next/link";
import { loginAction } from "@/server/actions";

const messages: Record<string, string> = {
  err_pending: "طلبك بانتظار قبول التقني أو من منحه صلاحية القبول.",
  err_rejected: "تم رفض طلب الانضمام.",
  err_bad_login: "الحساب موجود، لكن كلمة المرور لا تطابق الكلمة التي كُتبت عند التسجيل.",
  err_unknown: "لا يوجد حساب بهذا البريد. ادخل بالبريد الذي أرسلت به طلب التسجيل، لا بالرقم الوظيفي.",
  err_locked: "الحساب مقفل مؤقتاً بعد محاولات متكررة. انتظر ثم أعد المحاولة.",
};

export default async function EnterPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const query = await searchParams;
  const note = query.e ? messages[query.e] ?? messages.err_bad_login : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <p className="text-2xl font-semibold">كفاءة أوبس</p>
      <h1 className="mt-2 text-3xl font-semibold">تسجيل الدخول</h1>
      <p className="mt-2 text-sm leading-7 text-ink/70">ادخل بالبريد الذي كتبته عند التسجيل، وكلمة المرور نفسها. الرقم الوظيفي ليس اسم الدخول. كل منصب يدخل بحسابه.</p>
      {note ? <p className="mt-4 rounded-xl bg-card px-3 py-2 text-sm">{note}</p> : null}
      <form action={loginAction} className="mt-6 space-y-3">
        <label className="block text-sm font-semibold" htmlFor="email">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" required autoComplete="username" placeholder="name@company.sa" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <label className="block text-sm font-semibold" htmlFor="password">كلمة المرور</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" placeholder="كلمة المرور" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <button className="w-full rounded-xl bg-ink px-3 py-3 text-paper" type="submit">تسجيل الدخول</button>
      </form>
      <Link href="/join" className="mt-5 text-sm text-teal">تسجيل حساب جديد</Link>
      <Link href="/" className="mt-2 text-sm text-teal">العودة للواجهة الرئيسية</Link>
    </main>
  );
}
