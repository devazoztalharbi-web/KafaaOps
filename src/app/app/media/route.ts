import { readFileSync } from "node:fs";
import { decrypt } from "@/lib/crypto";
import { one } from "@/lib/db";
import { currentUser } from "@/server/actions";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user?.companyId) return new Response(null, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const kind = url.searchParams.get("kind");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const row = kind === "permit"
    ? one<{ photo_path: string | null }>("SELECT photo_path FROM permits WHERE id = ? AND company_id = ?", id, user.companyId)
    : kind === "alert"
      ? one<{ photo_path: string | null }>("SELECT photo_path FROM alerts WHERE id = ? AND company_id = ?", id, user.companyId)
      : undefined;
  if (!row?.photo_path) return new Response(null, { status: 404 });
  const bytes = decrypt(readFileSync(row.photo_path));
  const type = bytes[0] === 0x89 ? "image/png" : "image/jpeg";
  return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
}
