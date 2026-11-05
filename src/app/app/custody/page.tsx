import { availableCustody, listCustody, todayDirections } from "@/lib/field";
import { todayArrival } from "@/lib/ops";
import { custodyAction, currentUser } from "@/server/actions";

function clock(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

const fuelLabel: Record<string, string> = { E: "فارغ", Q1: "ربع", HALF: "نصف", Q3: "ثلاثة أرباع", F: "ممتلئ" };
const kindLabel: Record<string, string> = { RADIO: "استلام لاسلكي", RADIO_IN: "تسليم لاسلكي", VEHICLE_OUT: "استلام سيارة", VEHICLE_IN: "إعادة سيارة" };

export default async function CustodyPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  const query = await searchParams;
  if (!user?.companyId) return null;
  const rows = listCustody(user);
  const directions = todayDirections(user);
  const radio = directions.find((item) => item.kind === "RADIO");
  const vehicle = directions.find((item) => item.kind === "VEHICLE");
  const available = availableCustody(user);
  const arrived = Boolean(todayArrival(user.companyId, user.id));
  const field = user.role === "GUARD" || user.role === "SUPERVISOR";
  const canAddVehicle = user.role === "TECH_ADMIN" || user.role === "SECURITY_MANAGER";
  return (
    <section>
      <h1 className="text-2xl font-semibold">العهد</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/70">كل موظف يطلب العهدة بنفسه: لاسلكي أو سيارة. الاختيار ما يبدأ الوقت. بعد الصور والكيلومترات، زر «استلام العهد» يثبت الساعة، و«إرجاع العهدة» يقفلها. كذا نعرف من استلمها ومن أي ساعة إلى أي ساعة.</p>
      {query.e ? <p className="mt-3 text-sm">{query.e === "ok" ? "تم الحفظ." : `تعذر الحفظ: ${query.e}`}</p> : null}
      {canAddVehicle ? (
        <form action={custodyAction} className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="mode" value="vehicle" />
          <input name="code" required placeholder="رقم السيارة" className="rounded-xl border border-line px-3 py-2" />
          <input name="label" required placeholder="مثل: جيب الدورية" className="rounded-xl border border-line px-3 py-2" />
          <button className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">أضف سيارة</button>
        </form>
      ) : null}
      {field && !arrived ? <p className="mt-4 text-sm text-ink/70">قبل طلب العهدة: بصمة الدخول، ثم سيلفي الوصول داخل مسافة الموقع.</p> : null}
      {field && arrived && (available.radio || available.vehicles.length > 0) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {available.radio ? (
            <form action={custodyAction}>
              <input type="hidden" name="mode" value="choose" />
              <input type="hidden" name="kind" value="RADIO" />
              <button className="rounded-xl border border-line bg-card px-4 py-2" type="submit">جهاز لاسلكي</button>
            </form>
          ) : null}
          {available.vehicles.map((item) => (
            <form key={item.id} action={custodyAction}>
              <input type="hidden" name="mode" value="choose" />
              <input type="hidden" name="kind" value="VEHICLE" />
              <input type="hidden" name="vehicleId" value={item.id} />
              <button className="rounded-xl border border-line bg-card px-4 py-2" type="submit">{item.code} · {item.label}</button>
            </form>
          ))}
        </div>
      ) : null}
      {field && arrived && (radio?.status === "REQUESTED" || vehicle?.status === "REQUESTED") ? (
        <form action={custodyAction} className="mt-4 space-y-4">
          <input type="hidden" name="mode" value="receive" />
          {radio?.status === "REQUESTED" ? (
            <div className="space-y-2 rounded-2xl border border-line bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">جهاز لاسلكي</h2>
                <button className="rounded-full border border-line px-2 py-1 text-sm" form={`cancel-${radio.id}`} type="submit">×</button>
              </div>
              <p className="text-sm text-ink/70">{radio.note}</p>
              <input name="deviceNo" required placeholder="رقم الإشارة" className="w-full rounded-xl border border-line px-3 py-2" />
              <label className="block text-sm">صورة الجهاز<input name="radioPhoto" type="file" accept="image/jpeg,image/png" capture="environment" required /></label>
            </div>
          ) : null}
          {vehicle?.status === "REQUESTED" && vehicle.vehicle_id ? (
            <div className="space-y-2 rounded-2xl border border-line bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{vehicle.code} · {vehicle.label}</h2>
                <button className="rounded-full border border-line px-2 py-1 text-sm" form={`cancel-${vehicle.id}`} type="submit">×</button>
              </div>
              <p className="text-sm text-ink/70">{vehicle.note}</p>
              <input type="hidden" name="vehicleId" value={vehicle.vehicle_id} />
              <input name="km" type="number" min={0} required placeholder="كيلومترات الاستلام" className="w-full rounded-xl border border-line px-3 py-2" />
              <label className="block text-sm">من برا<input name="photo" type="file" accept="image/jpeg,image/png" capture="environment" required /></label>
              <label className="block text-sm">من جوا<input name="photo2" type="file" accept="image/jpeg,image/png" capture="environment" required /></label>
              <label className="block text-sm">صورة العداد<input name="odometer" type="file" accept="image/jpeg,image/png" capture="environment" required /></label>
            </div>
          ) : null}
          <button className="rounded-xl bg-ink px-4 py-3 text-paper" type="submit">استلام العهد</button>
        </form>
      ) : null}
      {field && radio?.status === "REQUESTED" ? (
        <form id={`cancel-${radio.id}`} action={custodyAction}>
          <input type="hidden" name="mode" value="cancel" />
          <input type="hidden" name="directionId" value={radio.id} />
        </form>
      ) : null}
      {field && vehicle?.status === "REQUESTED" ? (
        <form id={`cancel-${vehicle.id}`} action={custodyAction}>
          <input type="hidden" name="mode" value="cancel" />
          <input type="hidden" name="directionId" value={vehicle.id} />
        </form>
      ) : null}
      {field && (radio?.status === "RECEIVED" || vehicle?.status === "RECEIVED") ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {radio?.status === "RECEIVED" ? (
            <form action={custodyAction} className="space-y-2 rounded-2xl border border-line bg-card p-4">
              <input type="hidden" name="mode" value="radio-in" />
              <h2 className="font-semibold">اللاسلكي معك</h2>
              <p className="text-sm text-ink/70">من {clock(rows.find((row) => row.user_id === user.id && row.kind === "RADIO")?.created_at ?? new Date().toISOString())}</p>
              <input name="deviceNo" required placeholder="نفس رقم الإشارة" className="w-full rounded-xl border border-line px-3 py-2" />
              <label className="block text-sm">صورة الجهاز<input name="photo" type="file" accept="image/jpeg,image/png" capture="environment" required /></label>
              <button className="rounded-xl bg-teal px-3 py-2 text-white" type="submit">إرجاع العهدة</button>
            </form>
          ) : null}
          {vehicle?.status === "RECEIVED" && vehicle.vehicle_id ? (
            <form action={custodyAction} className="space-y-2 rounded-2xl border border-line bg-card p-4">
              <input type="hidden" name="mode" value="in" />
              <input type="hidden" name="vehicleId" value={vehicle.vehicle_id} />
              <h2 className="font-semibold">{vehicle.code} معك</h2>
              <p className="text-sm text-ink/70">من {clock(rows.find((row) => row.user_id === user.id && row.kind === "VEHICLE_OUT")?.created_at ?? new Date().toISOString())}</p>
              <input name="km" type="number" min={0} required placeholder="كيلومترات الإرجاع" className="w-full rounded-xl border border-line px-3 py-2" />
              <select name="fuel" className="w-full rounded-xl border border-line px-3 py-2">{Object.entries(fuelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <label className="block text-sm">صورة العداد<input name="odometer" type="file" accept="image/jpeg,image/png" capture="environment" required /></label>
              <label className="block text-sm">صورة البنزين<input name="fuelPhoto" type="file" accept="image/jpeg,image/png" capture="environment" required /></label>
              <button className="rounded-xl bg-teal px-3 py-2 text-white" type="submit">إرجاع العهدة</button>
            </form>
          ) : null}
        </div>
      ) : null}
      <ul className="mt-6 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line bg-card px-4 py-3 text-sm">
            {row.name_ar} · {kindLabel[row.kind] ?? row.kind} · {clock(row.created_at)}
            {row.device_no ? ` · ${row.device_no}` : ""}
            {row.odometer_km != null ? ` · ${row.odometer_km} كم` : ""}
            {row.fuel_level ? ` · ${fuelLabel[row.fuel_level] ?? row.fuel_level}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
