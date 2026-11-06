"use client";

import { useState } from "react";
import { reviewJoinAction } from "@/server/actions";

type Choice = { id: string; name_ar: string };
type Supervisor = Choice & { shift_no: number | null };

export function JoinReview({
  person,
  isTech,
  sites,
  managers,
  supervisors,
}: {
  person: { id: string; name_ar: string; email: string };
  isTech: boolean;
  sites: Choice[];
  managers: Choice[];
  supervisors: Supervisor[];
}) {
  const [open, setOpen] = useState(false);
  const [withPhoto, setWithPhoto] = useState(false);

  if (!open) {
    return (
      <li className="rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold">{person.name_ar}</p>
        <p className="text-sm text-ink/70">{person.email}</p>
        <div className="mt-3 flex gap-2">
          <button className="rounded-xl bg-teal px-3 py-2 text-white" type="button" onClick={() => setOpen(true)}>قبول</button>
          <form action={reviewJoinAction}>
            <input type="hidden" name="userId" value={person.id} />
            <button name="mode" value="reject" className="rounded-xl bg-ink px-3 py-2 text-paper" type="submit">رفض</button>
          </form>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <p className="font-semibold">{person.name_ar}</p>
      <p className="text-sm text-ink/70">{person.email}</p>
      <form action={reviewJoinAction} className="mt-3 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="userId" value={person.id} />
        <label className="text-sm">الرقم الوظيفي
          <input name="employeeNo" required maxLength={20} placeholder="مثال 1042" className="mt-1 w-full rounded-xl border border-line px-3 py-2" />
        </label>
        {isTech ? (
          <label className="text-sm">المسمى
            <select name="role" className="mt-1 w-full rounded-xl border border-line px-3 py-2">
              <option value="SECURITY_MANAGER">مدير الأمن</option>
              <option value="SUPERVISOR">مشرف الوردية</option>
              <option value="GUARD">حارس الأمن</option>
              <option value="HR">الموارد البشرية</option>
            </select>
          </label>
        ) : <input type="hidden" name="role" value="GUARD" />}
        <label className="text-sm">الموقع
          <select name="siteId" className="mt-1 w-full rounded-xl border border-line px-3 py-2">{sites.map((site) => <option key={site.id} value={site.id}>{site.name_ar}</option>)}</select>
        </label>
        <label className="text-sm">الوردية
          <select name="shiftNo" className="mt-1 w-full rounded-xl border border-line px-3 py-2"><option value="1">الوردية 1</option><option value="2">الوردية 2</option><option value="3">الوردية 3</option></select>
        </label>
        <label className="text-sm md:col-span-2">الربط
          <select name="managerId" className="mt-1 w-full rounded-xl border border-line px-3 py-2">
            <optgroup label="مدير الأمن">{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name_ar}</option>)}</optgroup>
            <optgroup label="المشرف">{supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name_ar} · وردية {supervisor.shift_no}</option>)}</optgroup>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input name="withPhoto" type="checkbox" value="1" className="h-4 w-4" checked={withPhoto} onChange={(event) => setWithPhoto(event.target.checked)} />
          إرفاق صورة للموظف
        </label>
        {withPhoto ? <input name="photo" type="file" accept="image/jpeg,image/png" required className="text-sm md:col-span-2" /> : null}
        <div className="flex gap-2">
          <button name="mode" value="approve" className="rounded-xl bg-teal px-3 py-2 text-white" type="submit">حفظ القبول</button>
          <button className="rounded-xl border border-line px-3 py-2" type="button" onClick={() => setOpen(false)}>رجوع</button>
        </div>
      </form>
    </li>
  );
}
