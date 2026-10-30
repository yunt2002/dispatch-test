"use client";

import { useRouter } from "next/navigation";

export function RouteBatchSelect({ date, batchId, options, embedded }: {
  date: string; batchId: string | null; embedded: boolean;
  options: { id: string; label: string }[];
}) {
  const router = useRouter();
  return <label className="route-batch-select">표시할 배차
    <select className="dispatch-select" value={batchId ?? ""} onChange={(event) => {
      const params = new URLSearchParams({ date });
      if (event.target.value) params.set("batch", event.target.value);
      router.replace(`${embedded ? "/" : "/map"}?${params.toString()}${embedded ? "#request-map" : ""}`, { scroll: false });
    }}>
      <option value="">배차 신청 (미확정)</option>
      {batchId && !options.some((option) => option.id === batchId) ? <option value={batchId}>확인할 수 없는 배차</option> : null}
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}
