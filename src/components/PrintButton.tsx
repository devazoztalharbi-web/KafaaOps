"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-xl bg-ink px-3 py-2 text-paper print:hidden">
      حفظ PDF
    </button>
  );
}
