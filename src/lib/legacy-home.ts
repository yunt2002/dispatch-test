import { redirect } from "next/navigation";

/** 예전 출하·배차 화면은 일정 홈으로 보냅니다. */
export function redirectLegacyToHome(date?: string): never {
  redirect(date ? `/?date=${encodeURIComponent(date)}` : "/");
}
