export type IntegrityReport = {
  platform: "android" | "ios";
  developerOptions: boolean;
  adbEnabled: boolean;
  mockLocation: boolean;
  simulatedLocation: boolean;
  checkedAt: string;
};

export type FieldBlock =
  | "err_developer_options"
  | "err_mock_location"
  | "err_native_required"
  | "err_integrity_stale";

const MAX_AGE_MS = 20_000;

export function fieldPunchBlock(report: IntegrityReport | null, userAgent: string, now = Date.now()): FieldBlock | null {
  const android = /Android/i.test(userAgent);
  const ios = /iPhone|iPad/i.test(userAgent);
  if (!android && !ios) return null;
  if (!report) return "err_native_required";
  const checked = Date.parse(report.checkedAt);
  if (!Number.isFinite(checked) || now - checked > MAX_AGE_MS || checked > now + 5_000) {
    return "err_integrity_stale";
  }
  if (report.developerOptions || report.adbEnabled) return "err_developer_options";
  if (report.mockLocation || report.simulatedLocation) return "err_mock_location";
  return null;
}

export function blockMessage(code: FieldBlock, locale: "ar" | "en") {
  const ar = {
    err_developer_options:
      "تطبيق كفاءة أوبس ما يشتغل وخيارات المطوّر مفعّلة. اقفلها من إعدادات الجوال ثم ارجع. هذا يمنع تطبيق الموقع الوهمي.",
    err_mock_location: "تم رفض الحضور لأن الموقع الحالي وهمي. أوقف تطبيق الموقع الوهمي ثم أعد المحاولة.",
    err_native_required: "حضور الميدان يتم من تطبيق كفاءة أوبس على الجوال، لأن المتصفح لا يستطيع فحص خيارات المطوّر.",
    err_integrity_stale: "أعِد فتح التطبيق. فحص أمان الجوال انتهت صلاحيته.",
  };
  const en = {
    err_developer_options:
      "KafaaOps stays closed while Developer options are on. Turn them off in phone settings, then come back. This blocks fake GPS apps.",
    err_mock_location: "Attendance was refused because this location is simulated. Turn the fake GPS app off and try again.",
    err_native_required: "Field attendance runs in the KafaaOps phone app. A phone browser cannot see Developer options.",
    err_integrity_stale: "Open the app again. The phone security check expired.",
  };
  return locale === "ar" ? ar[code] : en[code];
}
