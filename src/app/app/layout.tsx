import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { activeTemplate } from "@/lib/db";
import { currentUser } from "@/server/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const path = (await headers()).get("x-pathname") ?? "";
  const mustEnroll = (user.role === "GUARD" || user.role === "SUPERVISOR") && !activeTemplate(user.id);
  if (mustEnroll && path !== "/app/attendance") redirect("/app/attendance");
  return <Shell user={user}>{children}</Shell>;
}
