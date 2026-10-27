import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "네오마그네틱 배차",
  description: "일정 등록 · 차량 추천",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
