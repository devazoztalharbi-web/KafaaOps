import Link from "next/link";
import { AlertBanner } from "@/components/AlertBanner";
import { logoutAction } from "@/server/actions";
import { canCloseAlert } from "@/lib/field";
import { developer } from "@/lib/developer";
import { navigation, roleTitle } from "@/lib/nav";
import type { SessionUser } from "@/lib/auth";

export function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const links = navigation(user);
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-ink text-paper">
        <div className="mx-auto max-w-5xl px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <Link href="/app" className="text-lg font-semibold">كفاءة أوبس</Link>
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2">
              <div className="text-sm leading-5">
                <p className="font-semibold">{user.nameAr}</p>
                <p className="text-xs text-paper/75">{roleTitle[user.role]}{user.employeeNo ? ` · ${user.employeeNo}` : ""}</p>
              </div>
              <form action={logoutAction}>
                <button className="text-sm underline" type="submit">خروج</button>
              </form>
            </div>
          </div>
          <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/15 pt-3 text-sm">
            {links.map((link) => (
              <Link key={link.href} href={link.href}>{link.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <AlertBanner canClose={canCloseAlert(user)} />
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-5 pb-8 text-sm text-ink/70">
        {developer.roleAr}: {developer.nameAr}
      </footer>
    </div>
  );
}
