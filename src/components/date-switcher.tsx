"use client";

import { useRouter } from "next/navigation";
import { formatSheetDate } from "@/lib/format";

export function DateSwitcher({ dates, value }: { dates: string[]; value: string }) {
  const router = useRouter();
  const options = dates.includes(value) ? dates : [value, ...dates];

  function go(next: string) {
    if (!next) return;
    router.replace(`/?date=${encodeURIComponent(next)}`, { scroll: false });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label htmlFor="list-date" className="text-sm font-bold">
        납품일
      </label>
      {dates.length ? (
        <select
          id="list-date"
          className="select max-w-[220px]"
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
        className="input max-w-[180px]"
        type="date"
        value={value}
        onChange={(event) => go(event.target.value)}
      />
    </div>
  );
}
