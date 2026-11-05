import Link from "next/link";
import { joinAction } from "@/server/actions";

const messages: Record<string, string> = {
  ok: "وصل الطلب. بعد القبول سجّل الدخول، وسيطلب منك البرنامج تسجيل وجهك قبل أي إجراء.",
  err_join: "راجع الاسم ورمز الشركة.",
  err_password: "كلمة المرور ١٠ أحرف على الأقل، وفيها حرف ورقم.",
  err_join_code: "رمز الشركة غير صحيح.",
  err_email: "هذا البريد مسجل من قبل.",
};

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const query = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <h1 className="text-3xl font-semibold">طلب انضمام</h1>
      <p className="mt-2 text-sm leading-7 text-ink/70">الاسم والبريد وكلمة المرور ورمز الشركة. القبول عند التقني، أو عند من يمنحه التقني هذه الصلاحية.</p>
      {query.e && messages[query.e] ? <p className="mt-4 rounded-xl bg-card px-3 py-2 text-sm">{messages[query.e]}</p> : null}
      <form action={joinAction} className="mt-6 space-y-3">
        <input name="name" required placeholder="الاسم" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <input name="email" type="email" required placeholder="البريد" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <input name="password" type="password" required placeholder="كلمة المرور" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <input name="joinCode" required placeholder="رمز الشركة" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <button className="w-full rounded-xl bg-ink px-3 py-3 text-paper" type="submit">إرسال الطلب</button>
      </form>
      <Link href="/enter" className="mt-4 text-sm text-teal">عندك حساب؟ ادخل</Link>
    </main>
  );
}
