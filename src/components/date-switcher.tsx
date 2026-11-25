"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";

export function DateSwitcher({
  value,
  basePath = "/",
}: {
  dates?: string[];
  value: string;
  basePath?: string;
}) {
  const router = useRouter();
  const id = useId();

  function go(next: string) {
    if (!next) return;
    const path = basePath.endsWith("/") && basePath !== "/" ? basePath.slice(0, -1) : basePath;
    router.replace(`${path}?date=${encodeURIComponent(next)}`, { scroll: false });
  }

  return (
    <div className="date-switcher">
      <label className="date-switcher-label" htmlFor={`${id}-date`}>
        납품일
      </label>
      <div className="date-switcher-controls">
        <input
          id={`${id}-date`}
          className="input date-switcher-input"
          type="date"
          value={value}
          onChange={(event) => go(event.target.value)}
        />
      </div>
    </div>
  );
}
