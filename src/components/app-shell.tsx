"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

const DAILY = [
  { href: "/help", label: "사용설명서", match: (p: string) => p.startsWith("/help") },
  { href: "/simulation", label: "AI 배차 시뮬레이션", match: (p: string) => p === "/simulation" || p.startsWith("/simulation/") },
  { href: "/", label: "배차 신청", match: (p: string) => p === "/" || p.startsWith("/map") },
  { href: "/confirm", label: "배차 확정", match: (p: string) => p.startsWith("/confirm") },
];

const SETTINGS = [
  { href: "/products", label: "상품", match: (p: string) => p.startsWith("/products") },
  { href: "/plan", label: "처음 가져오기", match: (p: string) => p.startsWith("/plan") },
  { href: "/vehicles", label: "차량", match: (p: string) => p.startsWith("/vehicles") },
  { href: "/regions", label: "지역", match: (p: string) => p.startsWith("/regions") },
];

function NavLinks({
  items,
  pathname,
  date,
}: {
  items: { href: string; label: string; match: (path: string) => boolean }[];
  pathname: string;
  date?: string;
}) {
  return (
    <>
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href === "/simulation" && date ? `${item.href}?date=${encodeURIComponent(date)}` : item.href}
            className={`nav-link ${active ? "nav-link-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const selectedDate = useSearchParams().get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? selectedDate : undefined;
  const settingsActive = SETTINGS.some((item) => item.match(pathname));
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link className="app-brand" href="/">
          <span className="app-brand-mark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src="/brand/neo-logo.png?v=4" width={42} height={42} />
          </span>
          <span>
            <strong>Dispatch System</strong>
            <small>네오마그네틱 · 당일 운영</small>
          </span>
        </Link>
        <nav className="app-nav" aria-label="주 메뉴">
          <NavLinks items={DAILY} pathname={pathname} date={date} />
          <details className="nav-settings" open={settingsOpen || settingsActive}>
            <summary
              className="nav-settings-summary"
              onClick={(event) => {
                event.preventDefault();
                setSettingsOpen((open) => !open);
              }}
            >
              설정
            </summary>
            <div className="nav-settings-menu">
              <NavLinks items={SETTINGS} pathname={pathname} />
            </div>
          </details>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
