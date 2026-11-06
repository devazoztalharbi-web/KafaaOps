import Link from "next/link";
import { AlertBanner } from "@/components/AlertBanner";
import { logoutAction } from "@/server/actions";
import { canCloseAlert } from "@/lib/field";
import { developer } from "@/lib/developer";
import { navigation } from "@/lib/nav";
import type { SessionUser } from "@/lib/auth";

export function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const links = navigation(user);
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-ink text-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/app" className="font-semibold">كفاءة أوبس</Link>
          <nav className="flex gap-4 text-sm">
            {links.map((link) => (
              <Link key={link.href} href={link.href}>{link.label}</Link>
            ))}
          </nav>
          <div className="text-sm">
            <span>{user.nameAr}</span>
            <form action={logoutAction} className="inline">
              <button className="ms-3 underline" type="submit">خروج آمن</button>
            </form>
          </div>
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
