"use client";

import { useRef, useState } from "react";
import { faceAction } from "@/server/actions";

export function FaceCapture({ enrolled, siteId }: { enrolled: boolean; siteId: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 480 }, audio: false });
    if (videoRef.current) videoRef.current.srcObject = stream;
  }

  async function frames() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) throw new Error("camera");
    const scale = 480 / video.videoWidth;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("camera");
    const shots: Blob[] = [];
    for (let index = 0; index < 8; index += 1) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
      if (!blob) throw new Error("camera");
      shots.push(blob);
      await new Promise((resolve) => setTimeout(resolve, 280));
    }
    return shots;
  }

  async function submit(mode: "enroll" | "punch", kind: "IN" | "OUT") {
    setBusy(true);
    setMessage("انظر للكاميرا، ارمش مرة، وحرّك رأسك ببطء يميناً ويساراً. لا تبتسم. المطابقة على الخادم.");
    try {
      const shots = await frames();
      const form = new FormData();
      shots.forEach((shot, index) => form.append("frame", shot, `frame-${index}.jpg`));
      form.set("mode", mode);
      if (mode === "punch") {
        if (!siteId) throw new Error("site");
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 }));
        form.set("siteId", siteId);
        form.set("kind", kind);
        form.set("lat", String(position.coords.latitude));
        form.set("lng", String(position.coords.longitude));
        form.set("accuracy", String(position.coords.accuracy));
      }
      await faceAction(form);
    } catch {
      setMessage("تعذر التقاط الوجه أو الموقع.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-md rounded-2xl bg-ink" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-xl border border-line bg-card px-3 py-2" onClick={() => start().catch(() => setMessage("الكاميرا غير متاحة."))}>تشغيل الكاميرا</button>
        {enrolled ? (
          <>
            <button type="button" disabled={busy || !siteId} className="rounded-xl bg-teal px-3 py-2 text-white" onClick={() => submit("punch", "IN")}>دخول</button>
            <button type="button" disabled={busy || !siteId} className="rounded-xl bg-ink px-3 py-2 text-paper" onClick={() => submit("punch", "OUT")}>خروج</button>
          </>
        ) : (
          <button type="button" disabled={busy} className="rounded-xl bg-ink px-3 py-2 text-paper" onClick={() => submit("enroll", "IN")}>تسجيل الوجه</button>
        )}
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
