"use client";

import { useEffect, useRef, useState } from "react";
import { acknowledgeAction, listAlerts } from "@/server/actions";

type AlertRow = { id: string; kind: string; body: string; created_at: string; name_ar: string; employee_no: string | null; photo_path: string | null; place_label: string | null; place_site: string | null };

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
        for (let index = 0; index < 3; index += 1) {
          const tone = context.createOscillator();
          const gain = context.createGain();
          tone.frequency.value = 880;
          gain.gain.value = 0.2;
          tone.connect(gain);
          gain.connect(context.destination);
          tone.start(context.currentTime + index * 0.35);
          tone.stop(context.currentTime + index * 0.35 + 0.22);
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
    setSoundOn(true);
  }

  if (!rows.length && soundOn) return null;
  return (
    <div className={rows.length ? "bg-red-700 text-white" : "bg-ink text-paper"}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-3 text-sm">
        {rows.length ? rows.map((row) => (
          <article key={row.id} className="flex flex-wrap items-start gap-3 rounded-2xl bg-white p-3 text-ink">
            <div className="min-w-36 rounded-xl bg-red-700 px-3 py-2 text-center text-white">
              <p className="text-xs">بلاغ طارئ</p>
              <p className="mt-1 text-lg font-semibold">{row.place_label ?? "بدون توجيه"}</p>
              <p className="text-xs">{row.place_site ?? "لم يُحدد موقع اليوم"}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{row.name_ar}</p>
              <p className="mt-1">{row.body}</p>
              {row.photo_path ? <img src={`/app/media?kind=alert&id=${row.id}`} alt="صورة البلاغ الطارئ" className="mt-2 max-h-48 rounded-xl" /> : null}
            </div>
            {canClose ? (
              <form action={acknowledgeAction}>
                <input type="hidden" name="id" value={row.id} />
                <button className="rounded-lg bg-ink px-3 py-1 text-paper" type="submit">تم الاستلام</button>
              </form>
            ) : null}
          </article>
        )) : <p>شغّل الصوت ليُسمع جرس البلاغ الطارئ وهذه الصفحة مفتوحة. بلاغ الطفل لا يرن.</p>}
        {!soundOn ? <button className="self-start rounded-lg bg-white/15 px-3 py-1" type="button" onClick={() => void enable()}>تشغيل الصوت</button> : null}
      </div>
    </div>
  );
}
