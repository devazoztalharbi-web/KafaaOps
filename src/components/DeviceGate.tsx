"use client";

import { useEffect, useState } from "react";
import { blockMessage, type FieldBlock, type IntegrityReport } from "@/lib/device-integrity";

type NativeBridge = {
  getIntegrity: () => string | Promise<string>;
};

declare global {
  interface Window {
    KafaaNative?: NativeBridge;
    __kafaaIntegrity?: (report: IntegrityReport) => void;
  }
}

type GateState =
  | { kind: "checking" }
  | { kind: "open" }
  | { kind: "blocked"; code: FieldBlock };

export function DeviceGate({
  locale,
  enforce,
  children,
}: {
  locale: "ar" | "en";
  enforce: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<GateState>(enforce ? { kind: "checking" } : { kind: "open" });

  useEffect(() => {
    if (!enforce) return;
    let stopped = false;

    const apply = (report: IntegrityReport | null) => {
      if (stopped) return;
      if (!report) {
        setState({ kind: "blocked", code: "err_native_required" });
        return;
      }
      if (report.developerOptions || report.adbEnabled) {
        setState({ kind: "blocked", code: "err_developer_options" });
        return;
      }
      if (report.mockLocation || report.simulatedLocation) {
        setState({ kind: "blocked", code: "err_mock_location" });
        return;
      }
      setState({ kind: "open" });
    };

    const read = async () => {
      const bridge = window.KafaaNative;
      if (!bridge) {
        apply(null);
        return;
      }
      const raw = await bridge.getIntegrity();
      apply(JSON.parse(raw) as IntegrityReport);
    };

    window.__kafaaIntegrity = apply;
    void read();
    const timer = window.setInterval(() => void read(), 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      delete window.__kafaaIntegrity;
    };
  }, [enforce]);

  if (state.kind === "checking") {
    return <p className="text-sm text-ink/70">{locale === "ar" ? "جاري فحص أمان الجوال..." : "Checking the phone..."}</p>;
  }
  if (state.kind === "blocked") {
    return (
      <section className="max-w-xl rounded-2xl border border-bad/30 bg-white p-6">
        <h2 className="text-xl font-semibold text-bad">
          {locale === "ar" ? "الجوال غير مسموح" : "This phone is blocked"}
        </h2>
        <p className="mt-3 leading-7">{blockMessage(state.code, locale)}</p>
      </section>
    );
  }
  return children;
}
