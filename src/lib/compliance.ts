export type Locale = "ar" | "en";

export const frameworks = [
  {
    code: "ECC-2:2024",
    titleAr: "الضوابط الأساسية للأمن السيبراني",
    titleEn: "Essential Cybersecurity Controls",
    bodyAr: "الحد الأدنى الذي تطلبه الجهات: الصلاحيات، التشفير، السجلات، وحماية البيانات.",
    bodyEn: "The baseline buyers ask for: access control, cryptography, logging, and data protection.",
  },
  {
    code: "CCC-2:2024",
    titleAr: "ضوابط الأمن السيبراني للحوسبة السحابية",
    titleEn: "Cloud Cybersecurity Controls",
    bodyAr: "تراعى عند تشغيل النظام لدى مزود استضافة سحابية.",
    bodyEn: "Applied when the system runs on a cloud host.",
  },
  {
    code: "PDPL",
    titleAr: "نظام حماية البيانات الشخصية",
    titleEn: "Personal Data Protection Law",
    bodyAr: "بصمة الوجه والتقارير الطبية بيانات حساسة: موافقة، غرض محدد، وصلاحية ضيقة.",
    bodyEn: "Face templates and medical files are sensitive: consent, a stated purpose, and narrow access.",
  },
] as const;

export const standard = [
  {
    ar: "حضور الحارس هو نفسه سطر المسير. الغياب والإجازة والراتب تخرج من واقعة واحدة، لا من ملف إكسل ثانٍ.",
    en: "A guard's attendance is the payroll line. Absence, leave, and pay come from that one event, not a second spreadsheet.",
  },
  {
    ar: "الدليل يُفتح عند النزاع: من حضر، في أي موقع، بوقت الخادم، ونتيجة مطابقة الوجه، ومن اعتمد الإجازة.",
    en: "The evidence can be opened in a dispute: who attended, at which site, on the server clock, with the face result, and who approved the leave.",
  },
  {
    ar: "منع الحضور بدل الزميل يتم على الخادم بمقارنة الوجه المسجّل، لا بصورة تُترك للمشرف يتفرج عليها.",
    en: "Buddy punching is stopped on the server by matching the enrolled face, not by leaving a photo for a supervisor to glance at.",
  },
  {
    ar: "الإجازة تمشي من الموظف إلى مشرفه ثم الاعتماد النهائي من مدير الأمن، والموارد البشرية تستلم النتيجة للمسير.",
    en: "Leave goes from the employee to the supervisor, then final approval by the security manager. HR receives the result for payroll.",
  },
  {
    ar: "السجل نفسه يُفحص من داخل التطبيق. الشركة ترى السلسلة سليمة، ولا تكتفي بجملة تسويقية.",
    en: "The record can be checked inside the application. The company sees the chain intact, rather than trusting a slogan.",
  },
] as const;

export const controls = [
  {
    ar: "وقت الحضور والإجازة والسجل يُؤخذ من الخادم، لا من ساعة الجوال.",
    en: "Attendance, leave, and audit times come from the server clock, not the phone clock.",
  },
  {
    ar: "تسجيل الحضور الميداني لا يُقبل إلا داخل النطاق الجغرافي للموقع.",
    en: "Field attendance is accepted only inside the site geofence.",
  },
  {
    ar: "قالب الوجه والمرفقات تُحفظ مشفرة بـ AES-256.",
    en: "Face templates and uploaded files are stored with AES-256 encryption.",
  },
  {
    ar: "كل دور يرى عمله فقط: الحارس، المشرف، مدير الأمن، الموارد البشرية، والمسؤول التقني.",
    en: "Each role sees only its own work: guard, supervisor, security manager, HR, and technical admin.",
  },
  {
    ar: "مرفق الإجازة يُفحص نوعه وحجمه قبل الحفظ، والملف التنفيذي يُرفض.",
    en: "Leave attachments are checked for type and size, and executable files are refused.",
  },
  {
    ar: "سجل الحضور وسجل التدقيق لا يُعدَّلان ولا يُحذفان من شاشات النظام.",
    en: "Attendance and audit records cannot be edited or deleted from the system screens.",
  },
  {
    ar: "تطبيق الميدان يتوقف إذا كانت خيارات المطوّر مفعلة أو كان الموقع وهمياً.",
    en: "The field app stops when Developer options are on or the location is mocked.",
  },
  {
    ar: "مطابقة الوجه تتم على الخادم عند أول تسجيل وعند كل حضور.",
    en: "Face matching runs on the server at enrollment and at every attendance punch.",
  },
] as const;
