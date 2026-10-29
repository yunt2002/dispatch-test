"use client";

import { useRouter } from "next/navigation";
import { formatSheetDate } from "@/lib/format";

export function DateSwitcher({
  dates,
  value,
  basePath = "/",
}: {
  dates: string[];
  value: string;
  basePath?: string;
}) {
  const router = useRouter();
  const options = dates.includes(value) ? dates : [value, ...dates];

  function go(next: string) {
    if (!next) return;
    const path = basePath.endsWith("/") && basePath !== "/" ? basePath.slice(0, -1) : basePath;
    router.replace(`${path}?date=${encodeURIComponent(next)}`, { scroll: false });
  }

  return (
    <div className="date-switcher">
      <label className="date-switcher-label" htmlFor="list-date">
        납품일
      </label>
      <div className="date-switcher-controls">
        {dates.length ? (
          <select
            id="list-date"
            className="select date-switcher-select"
            value={value}
            onChange={(event) => go(event.target.value)}
          >
            {options.map((item) => (
              <option key={item} value={item}>
                {formatSheetDate(item)}
              </option>
            ))}
          </select>
        ) : null}
        <input
          aria-label="다른 날짜"
          className="input date-switcher-input"
          type="date"
          value={value}
          onChange={(event) => go(event.target.value)}
        />
      </div>
    </div>
  );
}
