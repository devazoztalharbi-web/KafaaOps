import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "كفاءة أوبس | KafaaOps",
  description: "تشغيل أفراد شركات الحراسة، من الميدان إلى مسير الراتب.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
