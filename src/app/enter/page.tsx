import Link from "next/link";
import { loginAction } from "@/server/actions";
import { developer } from "@/lib/developer";

export default async function EnterPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const query = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <p className="text-sm text-copper">KafaaOps</p>
      <h1 className="mt-1 text-3xl font-semibold">دخول النظام</h1>
      <p className="mt-2 text-sm text-ink/70">{developer.roleAr}: {developer.nameAr}</p>
      {query.e === "err_pending" ? <p className="mt-4 rounded-xl bg-white px-3 py-2 text-sm">طلبك بانتظار قبول التقني أو من منحه صلاحية القبول.</p> : null}
      {query.e === "err_rejected" ? <p className="mt-4 rounded-xl bg-white px-3 py-2 text-sm">تم رفض طلب الانضمام.</p> : null}
      {query.e && query.e !== "err_pending" && query.e !== "err_rejected" ? <p className="mt-4 rounded-xl bg-white px-3 py-2 text-sm">بيانات الدخول غير صحيحة، أو الحساب مقفل مؤقتاً.</p> : null}
      <form action={loginAction} className="mt-6 space-y-3">
        <input name="email" type="email" required placeholder="البريد" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <input name="password" type="password" required placeholder="كلمة المرور" className="w-full rounded-xl border border-line bg-card px-3 py-3" />
        <button className="w-full rounded-xl bg-ink px-3 py-3 text-paper" type="submit">دخول</button>
      </form>
      <Link href="/join" className="mt-4 text-sm text-teal">طلب انضمام جديد</Link>
      <Link href="/" className="mt-2 text-sm text-teal">العودة للواجهة الرئيسية</Link>
    </main>
  );
}
