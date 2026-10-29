import { DateSwitcher } from "@/components/date-switcher";
import { ScheduleEntryCard } from "@/components/schedule-entry-card";
import { ScheduleRegisterDialog } from "@/components/schedule-register-dialog";
import { ScheduleSelectionRoot } from "@/components/schedule-selection";
import { ErrorText, SuccessText } from "@/components/ui";
import { consolidateLabel } from "@/lib/consolidate-label";
import type { VehicleRecommendation } from "@/lib/dispatch-group";
import { formatNumber, formatSheetDate, parseJson, todayISO } from "@/lib/format";
import { importLatestExcelIfNeeded } from "@/lib/import-schedule";
import { geocodingStatus } from "@/lib/geocoding";
import { reasonOneLine, regionTypeLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { applyProductLoadingIfNeeded } from "@/lib/product-loading-apply";
import { getDispatchSettings } from "@/lib/settings";
import { matchRouteZone } from "@/lib/route-master";

type ScheduleEntry = Awaited<ReturnType<typeof loadEntries>>[number];

async function loadEntries(date: string) {
  return prisma.scheduleEntry.findMany({
    where: { deliveryDate: date, status: { not: "CANCELLED" } },
    orderBy: [{ createdAt: "desc" }, { locationName: "asc" }],
  });
}

function selectedVehicle(entry: ScheduleEntry) {
  return (
    parseJson<VehicleRecommendation | null>(entry.selectedVehicleJson, null) ??
    parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null)
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; ok?: string }>;
}) {
  const params = await searchParams;

  // 마이그레이션성 작업은 병렬. 잔여 재배정(rebalance)은 일정 변경 액션에서만 돌린다.
  await Promise.all([importLatestExcelIfNeeded(), applyProductLoadingIfNeeded()]);

  const [regions, scheduleDates, vehicles, settings] = await Promise.all([
    prisma.regionMaster.findMany({ orderBy: { locationName: "asc" } }),
    prisma.scheduleEntry.findMany({
      distinct: ["deliveryDate"],
      select: { deliveryDate: true },
      orderBy: { deliveryDate: "desc" },
    }),
    prisma.vehicleType.findMany({
      where: { isActive: true },
      orderBy: { vehicleName: "asc" },
    }),
    getDispatchSettings(),
  ]);

  const knownDates = [...new Set(scheduleDates.map((item) => item.deliveryDate))].sort((a, b) =>
    b.localeCompare(a),
  );
  const today = todayISO();
  const date = params.date || (knownDates.includes(today) ? today : knownDates[0]) || today;
  const entries = await loadEntries(date);

  const reviewEntries = entries.filter((entry) => entry.status === "PLANNED");
  const confirmedEntries = entries.filter((entry) => entry.status === "CONFIRMED");
  const doneEntries = entries.filter((entry) => entry.status === "DONE");
  const activeEntries = entries.filter((entry) => entry.status !== "DONE");

  const looseBoxEntries = activeEntries.filter(
    (entry) => entry.boxCount != null && entry.palletCount == null,
  );
  const looseBoxCount = looseBoxEntries.reduce((sum, entry) => sum + (entry.boxCount ?? 0), 0);

  const vehicleUsage = vehicles.map((vehicle) => {
    const assigned = activeEntries
      .map((entry) => ({ entry, selected: selectedVehicle(entry) }))
      .filter(({ selected }) => selected?.vehicleTypeId === vehicle.id);
    const pallets = assigned.reduce((sum, { entry }) => sum + (entry.palletCount ?? 0), 0);
    const boxes = assigned.reduce((sum, { entry }) => sum + (entry.boxCount ?? 0), 0);
    const maxTripCount = assigned.reduce(
      (max, { selected }) => Math.max(max, selected?.vehicleCount ?? 1),
      1,
    );
    const maxPallet = vehicle.maxPallet ?? 0;
    const neededTrucks =
      maxPallet > 0 && pallets > 0
        ? Math.max(maxTripCount, Math.ceil(pallets / maxPallet))
        : maxTripCount;
    const capacity = maxPallet > 0 ? maxPallet * neededTrucks : 0;
    const remaining = Math.max(0, capacity - pallets);
    const kg = pallets * settings.kgPerPallet;
    return {
      id: vehicle.id,
      name: vehicle.vehicleName,
      region: regionTypeLabel(vehicle.primaryRegionType),
      count: assigned.length,
      boxes,
      pallets,
      maxPallet,
      capacity,
      neededTrucks,
      remaining,
      kg,
    };
  });

  const zoneHints = [
    ...new Set(
      activeEntries
        .map((entry) => matchRouteZone({
          locationName: entry.locationName,
          customerName: entry.customerName,
        })?.label)
        .filter((label): label is string => Boolean(label)),
    ),
  ].slice(0, 4);

  const geo = geocodingStatus();
  const warnings = [
    ...new Set(activeEntries.flatMap((entry) => parseJson<string[]>(entry.warningsJson, []))),
  ].slice(0, 4);
  const vehicleOptions = vehicles.map((vehicle) => ({
    id: vehicle.id,
    vehicleName: vehicle.vehicleName,
  }));

  function card(entry: ScheduleEntry) {
    const recommended = parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null);
    const selected = selectedVehicle(entry);
    const qtyUnit = entry.palletCount != null && entry.boxCount == null ? "plt" : "box";
    const quantity = qtyUnit === "plt" ? (entry.palletCount ?? 0) : (entry.boxCount ?? 0);
    const qtyLabel =
      entry.boxCount != null && entry.palletCount != null
        ? `${formatNumber(entry.boxCount)} 박스 · ${formatNumber(entry.palletCount)} PLT`
        : entry.boxCount != null
          ? `${formatNumber(entry.boxCount)} 박스`
          : entry.palletCount != null
            ? `${formatNumber(entry.palletCount)} PLT`
            : "-";

    return (
      <ScheduleEntryCard
        consolidateGroupId={entry.consolidateGroupId}
        consolidateLabel={consolidateLabel(entry.consolidateGroupId)}
        customerName={entry.customerName}
        date={date}
        id={entry.id}
        key={entry.id}
        locationName={entry.locationName}
        logistics={entry.logistics}
        productName={entry.productName}
        qtyLabel={qtyLabel}
        qtyUnit={qtyUnit}
        quantity={quantity}
        reason={reasonOneLine(entry.recommendationReason)}
        recommendedName={recommended?.vehicleName ?? null}
        recommendedVehicleTypeId={recommended?.vehicleTypeId ?? null}
        regionTypeLabel={regionTypeLabel(entry.regionType)}
        selectedCount={selected?.vehicleCount ?? 1}
        selectedName={selected?.vehicleName ?? null}
        selectedVehicleTypeId={selected?.vehicleTypeId ?? null}
        status={entry.status}
        vehicles={vehicleOptions}
        warnings={parseJson<string[]>(entry.warningsJson, [])}
      />
    );
  }

  return (
    <div className="dispatch-page">
      <header className="dispatch-page-head">
        <div>
          <p className="dispatch-eyebrow">DAILY DELIVERY BOARD</p>
          <h1>오늘의 납품 흐름</h1>
          <p>추천 차량을 확인하고, 처리 상태를 오른쪽으로 넘기면 됩니다.</p>
        </div>
        <div className="dispatch-head-actions">
          <a className="dispatch-secondary-button" href={`/map?date=${encodeURIComponent(date)}`}>경로 · 지도</a>
          <a className="dispatch-secondary-button" href={`/api/schedule/export?date=${date}`}>이 달 내보내기</a>
          <a className="dispatch-secondary-button" href="/api/schedule/export?scope=all">전체 내보내기</a>
          <ScheduleRegisterDialog
            date={date}
            regions={regions}
            vehicles={vehicles.map((vehicle) => ({
              id: vehicle.id,
              vehicleName: vehicle.vehicleName,
            }))}
          />
        </div>
      </header>

      <ErrorText message={params.error} />
      <SuccessText message={params.ok} />

      <div className="dispatch-control-row">
        <DateSwitcher dates={knownDates} value={date} />
        <div className="dispatch-summary" aria-label="오늘 일정 요약">
          <div><span>전체</span><strong>{entries.length}</strong></div>
          <div><span>확정</span><strong>{confirmedEntries.length}</strong></div>
          <div><span>완료</span><strong>{doneEntries.length}</strong></div>
        </div>
      </div>

      <section className="dispatch-workflow" aria-label="업무 흐름">
        <b>업무 흐름</b>
        <span className="dispatch-workflow-step dispatch-workflow-step-active"><i>1</i> 납품 등록</span>
        <span className="dispatch-workflow-step dispatch-workflow-step-active"><i>2</i> 차량 추천 확인</span>
        <span className={`dispatch-workflow-step ${confirmedEntries.length || doneEntries.length ? "dispatch-workflow-step-active" : ""}`}><i>3</i> 배차 확정</span>
        <span className={`dispatch-workflow-step ${doneEntries.length ? "dispatch-workflow-step-active" : ""}`}><i>4</i> 납품 완료</span>
      </section>

      <datalist id="location-options">
        {regions.map((region) => <option key={region.id} value={region.locationName} />)}
      </datalist>

      <div className="dispatch-workspace">
        <ScheduleSelectionRoot date={date} entryIds={entries.map((entry) => entry.id)}>
        <section className="dispatch-board" aria-label={`${formatSheetDate(date)} 배차 보드`}>
          <section className="dispatch-column dispatch-column-review">
            <div className="dispatch-column-head"><div><i /><strong>추천 확인</strong><span>담당자 승인 전</span></div><b>{reviewEntries.length}</b></div>
            <div className="dispatch-card-list">
              {reviewEntries.length ? reviewEntries.map(card) : <p className="dispatch-column-empty">확인할 추천이 없습니다.</p>}
            </div>
          </section>
          <section className="dispatch-column dispatch-column-confirmed">
            <div className="dispatch-column-head"><div><i /><strong>배차 확정</strong><span>오늘 출발 예정</span></div><b>{confirmedEntries.length}</b></div>
            <div className="dispatch-card-list">
              {confirmedEntries.length ? confirmedEntries.map(card) : <p className="dispatch-column-empty">확정된 배차가 없습니다.</p>}
            </div>
          </section>
          <section className="dispatch-column dispatch-column-done">
            <div className="dispatch-column-head"><div><i /><strong>납품 완료</strong><span>처리 종료</span></div><b>{doneEntries.length}</b></div>
            <div className="dispatch-card-list">
              {doneEntries.length ? doneEntries.map(card) : <p className="dispatch-column-empty">완료된 납품이 없습니다.</p>}
            </div>
          </section>
        </section>
        </ScheduleSelectionRoot>

        <aside className="dispatch-side">
          <section className="dispatch-vehicle-panel">
            <h2>잔여 PLT · 차량</h2>
            <p className="dispatch-side-meta">
              박스·PLT 함께 표시 · 기준 {settings.kgPerPallet}kg/PLT · 1·2호 최대 8 PLT
            </p>
            {vehicleUsage.map((vehicle, index) => {
              const maxPallet = vehicle.maxPallet ?? 0;
              const denom = vehicle.capacity > 0 ? vehicle.capacity : maxPallet;
              const load = denom > 0
                ? Math.min(100, Math.round((vehicle.pallets / denom) * 100))
                : 0;
              const overOneTruck = maxPallet > 0 && vehicle.pallets > maxPallet;
              return (
                <div className="dispatch-vehicle-usage" key={vehicle.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{vehicle.name} · {vehicle.region}</strong>
                    <small>
                      {vehicle.count
                        ? `${vehicle.count}건 · 박스 ${formatNumber(vehicle.boxes)} · ${formatNumber(vehicle.pallets)}/${formatNumber(denom || maxPallet)} PLT`
                        : `박스 0 · 0/${formatNumber(maxPallet)} PLT`}
                      {vehicle.neededTrucks > 1 ? ` · ${vehicle.neededTrucks}대` : ""}
                      {overOneTruck ? " · 복수 대 필요" : ""}
                      {" · "}
                      잔여 <b>{formatNumber(vehicle.remaining)}</b> PLT
                      {vehicle.pallets > 0
                        ? ` · 약 ${formatNumber(vehicle.kg)}kg`
                        : ""}
                    </small>
                    <div className="dispatch-loadbar"><i style={{ width: `${Math.max(5, load)}%` }} /></div>
                  </div>
                </div>
              );
            })}
            {looseBoxCount > 0 ? (
              <p className="dispatch-loose-note">
                낱개 박스 {formatNumber(looseBoxCount)} · PLT 미환산 · 별도 보관
              </p>
            ) : null}
          </section>
          <section className="dispatch-notice-panel">
            <h2>오늘의 확인 사항</h2>
            {zoneHints.length ? (
              <p><i /> <span>권역: {zoneHints.join(" · ")}</span></p>
            ) : null}
            <p><i /> <span>{geo.message}</span></p>
            {warnings.length ? warnings.map((warning) => (
              <p key={warning}><i /> <span>{warning}</span></p>
            )) : !zoneHints.length ? (
              <p className="dispatch-no-warning">현재 확인이 필요한 경고가 없습니다.</p>
            ) : null}
          </section>
          <section className="dispatch-export-note">
            잔여 PLT를 보고 유동 권역(충청·세종 등)은 1호/2호를 고르세요. 거리·통행료는 지도 API 연동 후 자동 산출 예정입니다.
          </section>
        </aside>
      </div>
    </div>
  );
}
