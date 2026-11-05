"use client";

import { useEffect, useRef, useState } from "react";
import { acknowledgeAction, listAlerts } from "@/server/actions";

type AlertRow = { id: string; kind: string; body: string; created_at: string; name_ar: string; employee_no: string | null };

function personMark(row: AlertRow) {
  const source = (row.employee_no ?? row.name_ar).replace(/\s/g, "");
  return source.slice(-3) || "•";
}

const kindLabel: Record<string, string> = { FIGHT: "مضاربة", SECURITY: "مشكلة أمنية" };

export function AlertBanner({ canClose }: { canClose: boolean }) {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const seen = useRef(new Set<string>());
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    let stop = false;
    async function pull() {
      const next = await listAlerts();
      if (stop) return;
      const fresh = next.filter((row) => !seen.current.has(row.id));
      next.forEach((row) => seen.current.add(row.id));
      setRows(next);
      if (fresh.length && soundOn && audio.current) {
        const context = audio.current;
        const tone = context.createOscillator();
        const gain = context.createGain();
        tone.frequency.value = 880;
        gain.gain.value = 0.2;
        tone.connect(gain);
        gain.connect(context.destination);
        tone.start();
        tone.stop(context.currentTime + 0.6);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          fresh.forEach((row) => new Notification(`${personMark(row)} ${row.name_ar}`, { body: `${kindLabel[row.kind] ?? "بلاغ طارئ"}: ${row.body}` }));
        }
      }
    }
    void pull();
    const timer = setInterval(() => void pull(), 8000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [soundOn]);

  async function enable() {
    audio.current = new AudioContext();
    await audio.current.resume();
    if (typeof Notification !== "undefined") await Notification.requestPermission();
    setSoundOn(true);
  }

  if (!rows.length && soundOn) return null;
  return (
    <div className={rows.length ? "bg-red-700 text-white" : "bg-ink text-paper"}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
        <div className="flex flex-1 flex-col gap-2">
          {rows.length ? rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-red-700">{personMark(row)}</span>
              <p>{kindLabel[row.kind]} · {row.name_ar}: {row.body}</p>
              {canClose ? (
                <form action={acknowledgeAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className="rounded-lg bg-white px-3 py-1 text-ink" type="submit">تم الاستلام</button>
                </form>
              ) : null}
            </div>
          )) : <p>تنبيه الأجهزة يعمل طالما هذه الشاشة مفتوحة.</p>}
        </div>
        {!soundOn ? <button className="rounded-lg bg-white/15 px-3 py-1" type="button" onClick={() => void enable()}>تشغيل الصوت</button> : null}
      </div>
    </div>
  );
}
