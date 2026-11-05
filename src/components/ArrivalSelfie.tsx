"use client";

import { useRef, useState } from "react";
import { arrivalAction } from "@/server/actions";

export function ArrivalSelfie() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("");

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 480 }, audio: false });
    if (videoRef.current) videoRef.current.srcObject = stream;
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setMessage("شغّل الكاميرا أولاً.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * 480);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) return;
    const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 }));
    const form = new FormData();
    form.set("photo", blob, "arrival.jpg");
    form.set("lat", String(position.coords.latitude));
    form.set("lng", String(position.coords.longitude));
    form.set("accuracy", String(position.coords.accuracy));
    await arrivalAction(form);
  }

  return (
    <div className="mt-6 space-y-3 border-t border-line pt-6">
      <h2 className="text-xl font-semibold">سيلفي الوصول</h2>
      <p className="max-w-2xl text-sm leading-7 text-ink/70">هذي صورة عادية بعد بصمة الدخول، مو مطابقة وجه. تنقبل فقط إذا كنت داخل المسافة المحددة حول إحداثيات موقع العمل.</p>
      <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-md rounded-2xl bg-ink" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-xl border border-line bg-card px-3 py-2" onClick={() => start().catch(() => setMessage("الكاميرا غير متاحة."))}>تشغيل الكاميرا</button>
        <button type="button" className="rounded-xl bg-teal px-3 py-2 text-white" onClick={() => shoot().catch(() => setMessage("تعذر تصوير الوصول أو قراءة الموقع."))}>تصوير الوصول</button>
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
