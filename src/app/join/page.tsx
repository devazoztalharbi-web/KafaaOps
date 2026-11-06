import Link from "next/link";
import { joinAction } from "@/server/actions";

const messages: Record<string, string> = {
  ok: "وصل الطلب. بعد قبول التقني سجّل الدخول، وسيطلب منك البرنامج تسجيل وجهك قبل أي إجراء ميداني.",
  err_join: "راجع الاسم ورمز الشركة.",
  err_password: "كلمة المرور ١٠ أحرف على الأقل، وفيها حرف ورقم.",
  err_join_code: "رمز الشركة غير صحيح.",
  err_email: "هذا البريد مسجل من قبل.",
};

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const query = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <p className="text-sm tracking-[0.16em] text-copper">KafaaOps</p>
      <h1 className="mt-2 text-3xl font-semibold">تسجيل حساب</h1>
      <p className="mt-2 text-sm leading-7 text-ink/70">الاسم والبريد وكلمة المرور ورمز الشركة. الطلب يبقى معلقاً. المسؤول التقني هو من يحدد المنصب: مدير الأمن، ثم المشرف، ثم الحارس. الموارد البشرية بلا وردية. الحارس والمشرف يسجّلان الوجه عند أول دخول.</p>
      {query.e && messages[query.e] ? <p className="mt-4 rounded-xl bg-card px-3 py-2 text-sm">{messages[query.e]}</p> : null}
      <form action={joinAction} className="mt-6 space-y-3">
        <label className="block text-sm font-semibold" htmlFor="name">الاسم</label>
        <input id="name" name="name" required autoComplete="name" placeholder="الاسم الثلاثي" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <label className="block text-sm font-semibold" htmlFor="email">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" required autoComplete="email" placeholder="name@company.sa" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <label className="block text-sm font-semibold" htmlFor="password">كلمة المرور</label>
        <input id="password" name="password" type="password" required autoComplete="new-password" minLength={10} placeholder="حرف ورقم، ١٠ أحرف على الأقل" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <label className="block text-sm font-semibold" htmlFor="joinCode">رمز الشركة</label>
        <input id="joinCode" name="joinCode" required autoComplete="off" placeholder="رمز الشركة" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <button className="w-full rounded-xl bg-ink px-3 py-3 text-paper" type="submit">إرسال طلب الحساب</button>
      </form>
      <Link href="/enter" className="mt-5 text-sm text-teal">عندك حساب؟ تسجيل الدخول</Link>
      <Link href="/" className="mt-2 text-sm text-teal">العودة للواجهة الرئيسية</Link>
    </main>
  );
}
