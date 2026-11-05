import { unlinkSync } from "node:fs";
import { login } from "../src/lib/auth";
import { appendChain, db } from "../src/lib/db";
import { recordArrival, setSiteFence } from "../src/lib/ops";

let passed = 0;
let total = 0;
function check(name: string, ok: boolean, detail: string) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  if (!ok) process.exitCode = 1;
}

const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxMTEhUTExMWFRUXGBcYGBgYGBoYGBgYGBgYGBgYGBgYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAADAAIEBQYBB//EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Anf/Z",
  "base64",
);

const guard = login("guard@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "arrival-check" });
const manager = login("manager@kafaaops.local", "Kafaa.Ops#2026", { ip: "127.0.0.1", userAgent: "arrival-check" });
if (!("user" in guard) || !("user" in manager) || !guard.user.companyId || !guard.user.siteId) throw new Error("seed login failed");
const site = db().prepare("SELECT latitude, longitude, radius_m FROM sites WHERE id = ?").get(guard.user.siteId) as { latitude: number; longitude: number; radius_m: number };
const denied = setSiteFence(guard.user, { siteId: guard.user.siteId, lat: site.latitude, lng: site.longitude, radius: 900 });
check("a guard cannot change the site distance", "error" in denied, "error" in denied ? denied.error : "saved");
const fence = setSiteFence(manager.user, { siteId: guard.user.siteId, lat: site.latitude, lng: site.longitude, radius: 900 });
check("manager stores a 900 meter radius", "radius" in fence && fence.radius === 900, "error" in fence ? fence.error : String(fence.radius));
appendChain("punches", guard.user.companyId, {
  id: crypto.randomUUID(),
  company_id: guard.user.companyId,
  user_id: guard.user.id,
  site_id: guard.user.siteId,
  kind: "IN",
  server_time: new Date().toISOString(),
}, { kind: "IN", userId: guard.user.id });
const far = recordArrival(guard.user, { lat: site.latitude + 0.02, lng: site.longitude, accuracy: 10, photo: jpeg });
check("a selfie outside the radius is refused", "error" in far && far.error === "err_fence", "error" in far ? far.error : "saved");
const near = recordArrival(guard.user, { lat: site.latitude + 700 / 111320, lng: site.longitude, accuracy: 10, photo: jpeg });
check("a plain selfie inside 900 meters is stored without a face match", "dutyDate" in near, "error" in near ? near.error : near.dutyDate);
setSiteFence(manager.user, { siteId: guard.user.siteId, lat: site.latitude, lng: site.longitude, radius: site.radius_m });
const photo = db().prepare("SELECT photo_path FROM arrival_photos WHERE user_id = ?").get(guard.user.id) as { photo_path: string } | undefined;
if (photo?.photo_path) unlinkSync(photo.photo_path);
db().prepare("DELETE FROM arrival_photos WHERE user_id = ?").run(guard.user.id);
console.log(`${passed}/${total} arrival checks passed`);
