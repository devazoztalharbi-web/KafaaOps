import { ArrivalSelfie } from "@/components/ArrivalSelfie";
import { FaceCapture } from "@/components/FaceCapture";
import { activeTemplate } from "@/lib/db";
import { punchedInToday, todayArrival } from "@/lib/ops";
import { currentUser } from "@/server/actions";

const messages: Record<string, string> = {
  enrolled: "تم تسجيل الوجه على الخادم.",
  punched: "تم تسجيل الحركة بوقت الخادم.",
  err_face: "الوجه لا يطابق القالب المسجل.",
  err_liveness: "لم تُرصد رمشة. أعد الالتقاط وأنت ترمش.",
  err_no_face: "لا يوجد وجه واضح في الصورة.",
  err_face_count: "يجب أن يظهر وجه واحد فقط.",
  err_no_template: "سجّل الوجه أولاً.",
  err_fence: "موقعك خارج نطاق الموقع.",
  err_accuracy: "دقة الموقع أضعف من المسموح.",
  err_native_required: "بصمة الجوال تتم من تطبيق كفاءة أوبس بعد فحص خيارات المطوّر.",
  err_developer_options: "أغلق خيارات المطوّر ثم أعد المحاولة.",
  err_file_type: "الصورة يجب أن تكون JPEG من الكاميرا.",
  err_attendance: "سيلفي الوصول يفتح بعد بصمة الدخول.",
  arrived: "تم حفظ سيلفي الوصول داخل نطاق الموقع.",
};

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  const query = await searchParams;
  if (!user) return null;
  const enrolled = Boolean(activeTemplate(user.id));
  return (
    <section>
      <h1 className="text-2xl font-semibold">بصمة الحضور والانصراف</h1>
      <p className="mt-2 max-w-2xl leading-7">
        {enrolled ? "هذي بصمة الوجه للدوام والغياب، وهي اللي تنزل في المسير. الدخول والخروج يطابقان القالب على الخادم." : "قبل أي إجراء ميداني: انظر للكاميرا، ارمش مرة، وحرّك رأسك يميناً ويساراً. الابتسامة لا تُستخدم لأنها تغيّر البصمة."}
      </p>
      {query.e && messages[query.e] ? <p className="mt-3 text-sm">{messages[query.e]}</p> : null}
      {!user.siteId && enrolled ? <p className="mt-3 text-sm">لا يوجد موقع مرتبط بهذا الحساب، لذلك لا يمكن تسجيل الحركة.</p> : null}
      <FaceCapture enrolled={enrolled} siteId={user.siteId} />
      {enrolled && user.companyId && user.siteId && punchedInToday(user.companyId, user.id) ? <ArrivalSelfie /> : null}
      {enrolled && user.companyId && todayArrival(user.companyId, user.id) ? <p className="mt-3 text-sm">سيلفي الوصول محفوظ لهذا اليوم.</p> : null}
    </section>
  );
}
