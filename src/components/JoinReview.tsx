"use client";

import { useRef, useState } from "react";
import { reviewJoinAction } from "@/server/actions";

const roles = ["SECURITY_MANAGER", "SUPERVISOR", "GUARD", "HR"] as const;

export function JoinReview({
  person,
  isTech,
}: {
  person: { id: string; name_ar: string; email: string };
  isTech: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<(typeof roles)[number]>(isTech ? "SECURITY_MANAGER" : "GUARD");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const needsProject = role !== "HR";
  const needsShift = role === "SUPERVISOR";
  const needsLink = role === "SUPERVISOR" || role === "GUARD";

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
            <select name="role" value={role} onChange={(event) => setRole(event.target.value as (typeof roles)[number])} className="mt-1 w-full rounded-xl border border-line px-3 py-2">
              <option value="SECURITY_MANAGER">مدير الأمن</option>
              <option value="SUPERVISOR">مشرف الوردية</option>
              <option value="GUARD">حارس الأمن</option>
              <option value="HR">الموارد البشرية</option>
            </select>
          </label>
        ) : <input type="hidden" name="role" value="GUARD" />}
        {needsProject ? (
          <label className="text-sm">المشروع
            <input name="projectName" required maxLength={80} placeholder="اكتب اسم المشروع" className="mt-1 w-full rounded-xl border border-line px-3 py-2" />
          </label>
        ) : null}
        {needsShift ? (
          <label className="text-sm">الوردية
            <select name="shiftNo" className="mt-1 w-full rounded-xl border border-line px-3 py-2">
              <option value="1">الوردية 1</option>
              <option value="2">الوردية 2</option>
              <option value="3">الوردية 3</option>
            </select>
          </label>
        ) : null}
        {needsLink ? (
          <label className="text-sm md:col-span-2">الربط
            <input name="linkText" required maxLength={80} placeholder={role === "GUARD" ? "رقم المشرف أو اسمه" : "رقم مدير الأمن أو اسمه"} className="mt-1 w-full rounded-xl border border-line px-3 py-2" />
            <span className="mt-1 block text-xs text-ink/60">{role === "GUARD" ? "اكتب الرقم الوظيفي للمشرف، أو اسمه إذا كان وحيداً. وردية الحارس تُؤخذ من مشرفه." : "اكتب الرقم الوظيفي لمدير الأمن، أو اسمه إذا كان وحيداً."}</span>
          </label>
        ) : null}
        <div className="md:col-span-2">
          <input
            ref={fileRef}
            name="photo"
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          />
          <button className="inline-flex items-center gap-2 rounded-xl border border-ink bg-paper px-4 py-2 text-sm font-semibold" type="button" onClick={() => fileRef.current?.click()}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21.4 11.1 12.5 20a5 5 0 0 1-7.1-7.1l8.9-8.9a3.5 3.5 0 0 1 5 5l-8.9 8.9a2 2 0 0 1-2.8-2.8l8.2-8.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            إرفاق
          </button>
          <p className="mt-2 text-sm text-ink/70">{fileName || "صورة الموظف اختيارية. اضغط إرفاق لاختيارها."}</p>
        </div>
        <div className="flex gap-2">
          <button name="mode" value="approve" className="rounded-xl bg-teal px-3 py-2 text-white" type="submit">حفظ القبول</button>
          <button className="rounded-xl border border-line px-3 py-2" type="button" onClick={() => setOpen(false)}>رجوع</button>
        </div>
      </form>
    </li>
  );
}
