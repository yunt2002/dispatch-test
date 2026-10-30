import { DateSwitcher } from "@/components/date-switcher";
import { GeumsureFare } from "@/components/geumsure-fare";
import { ScheduleEntryCard } from "@/components/schedule-entry-card";
import { ScheduleGroupCard } from "@/components/schedule-group-card";
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
import { computeShipmentWeightKg } from "@/lib/pallet-weight";
import { matchProductLoading } from "@/lib/product-loading";
import { applyProductLoadingIfNeeded } from "@/lib/product-loading-apply";
import { getDispatchSettings } from "@/lib/settings";
import { matchRouteZone } from "@/lib/route-master";
import { summarizeVehicleWeight } from "@/lib/vehicle-weight-summary";
import { groupScheduleCards } from "@/lib/schedule-card-groups";
import MapRoutePage from "@/components/map-route-page";
import { EXTERNAL_TRANSPORTS, externalTransport, transportFeeKey } from "@/lib/external-transport";

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
  view,
}: {
  searchParams: Promise<{ date?: string; error?: string; ok?: string; batch?: string }>;
  view: "request" | "confirm";
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
  const feeKeys = entries.flatMap((entry) => { const selected = selectedVehicle(entry); return selected ? [transportFeeKey(entry.id, selected.vehicleTypeId)] : []; });
  const feeSettings = view === "confirm" && feeKeys.length ? await prisma.appSetting.findMany({ where: { key: { in: feeKeys } }, select: { key: true, value: true } }) : [];
  const fees = new Map(feeSettings.map((setting) => [setting.key, setting.value]));

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
    const weights = assigned.map(({ entry }) => {
      const family = matchProductLoading(entry.productCode, entry.productName);
      const weight = computeShipmentWeightKg({
        boxCount: entry.boxCount,
        palletCount: entry.palletCount,
        boxWeightG: family?.boxWeightG,
        kgPerPallet: family?.kgPerPallet,
        fallbackKgPerPallet: settings.kgPerPallet,
      });
      return weight;
    });
    const weight = summarizeVehicleWeight(weights, vehicle.maxWeight);
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
      weight,
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
  const vehicleOptions = [...vehicles.map((vehicle) => ({
    id: vehicle.id,
    vehicleName: vehicle.vehicleName,
  })), ...EXTERNAL_TRANSPORTS];

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
        reason={externalTransport(selected?.vehicleTypeId) ? "외부 운송 · 자사 차량 경로에서 제외" : reasonOneLine(entry.recommendationReason)}
        recommendedName={recommended?.vehicleName ?? null}
        recommendedVehicleTypeId={recommended?.vehicleTypeId ?? null}
        regionTypeLabel={regionTypeLabel(entry.regionType)}
        selectedCount={selected?.vehicleCount ?? 1}
        selectedName={selected?.vehicleName ?? null}
        selectedVehicleTypeId={selected?.vehicleTypeId ?? null}
        status={entry.status}
        transportFee={selected ? fees.get(transportFeeKey(entry.id, selected.vehicleTypeId)) ?? null : null}
        vehicles={vehicleOptions}
        warnings={parseJson<string[]>(entry.warningsJson, [])}
        returnTo={view}
        allowConfirm={view === "confirm"}
      />
    );
  }

  function cards(list: ScheduleEntry[]) {
    return groupScheduleCards(list).map((group) => {
      const first = group[0];
      const allMembers = first.consolidateGroupId ? entries.filter((entry) => entry.consolidateGroupId === first.consolidateGroupId) : [];
      if (!first.consolidateGroupId || allMembers.length < 2) return card(first);
      const selected = selectedVehicle(first);
      const totalPallets = group.reduce((sum, entry) => sum + (entry.palletCount ?? 0), 0);
      const unknownPallets = group.filter((entry) => entry.palletCount == null).length;
      const warnings = [...new Set(group.flatMap((entry) => parseJson<string[]>(entry.warningsJson, [])))];
      if (new Set(group.map((entry) => selectedVehicle(entry)?.vehicleTypeId ?? "")).size > 1) warnings.push("묶음 내 차량 배정이 서로 다릅니다. 차량을 확인하세요.");
      if (allMembers.some((entry) => entry.status !== first.status)) warnings.push("이 묶음의 일부 품목이 다른 상태에 있습니다. 다른 상태 칸도 확인하세요.");
      return <ScheduleGroupCard
        key={`${first.consolidateGroupId}-${first.status}`}
        date={date} groupId={first.consolidateGroupId} label={consolidateLabel(first.consolidateGroupId) ?? "묶음"}
        status={first.status} selectedVehicleId={selected?.vehicleTypeId ?? null}
        returnTo={view} allowConfirm={view === "confirm"}
        vehicleName={selected?.vehicleName ?? null} vehicleCount={selected?.vehicleCount ?? 1} vehicles={vehicleOptions} warnings={warnings}
        totalLabel={unknownPallets ? `${formatNumber(totalPallets)} PLT + ${unknownPallets}건 미확인` : `합계 ${formatNumber(totalPallets)} PLT`}
        items={group.map((entry) => {
          const itemVehicle = selectedVehicle(entry);
          const qtyUnit = entry.palletCount != null && entry.boxCount == null ? "plt" as const : "box" as const;
          return { id: entry.id, locationName: entry.locationName, customerName: entry.customerName, productName: entry.productName,
            vehicleId: itemVehicle?.vehicleTypeId ?? null,
            transportFee: itemVehicle ? fees.get(transportFeeKey(entry.id, itemVehicle.vehicleTypeId)) ?? null : null,
            quantity: qtyUnit === "plt" ? entry.palletCount ?? 0 : entry.boxCount ?? 0, qtyUnit,
            qtyLabel: entry.boxCount != null && entry.palletCount != null ? `${formatNumber(entry.boxCount)} 박스 · ${formatNumber(entry.palletCount)} PLT`
              : entry.boxCount != null ? `${formatNumber(entry.boxCount)} 박스` : entry.palletCount != null ? `${formatNumber(entry.palletCount)} PLT` : "-" };
        })}
      />;
    });
  }

  return (
    <div className="dispatch-page">
      <header className="dispatch-page-head">
        <div>
          <p className="dispatch-eyebrow">DAILY DELIVERY BOARD</p>
          <h1>{view === "request" ? "배차 신청" : "배차 확정"}</h1>
          <p>{view === "request" ? "납품과 차량을 준비하고 아래 지도에서 경로를 확인하세요." : "확정 대기를 확인하고, 확정된 납품을 오른쪽에서 관리하세요."}</p>
        </div>
        <div className="dispatch-head-actions">
          <a className="dispatch-secondary-button" href={`${view === "request" ? "/confirm" : "/"}?date=${encodeURIComponent(date)}`}>{view === "request" ? "다음: 배차 확정" : "배차 신청으로"}</a>
          <a className="dispatch-secondary-button" href={`/api/schedule/export?date=${date}`}>이 달 내보내기</a>
          <a className="dispatch-secondary-button" href="/api/schedule/export?scope=all">전체 내보내기</a>
          {view === "request" ? <a className="dispatch-primary-button" href="#new-delivery">＋ 새 납품 등록</a> : null}
        </div>
      </header>

      <ErrorText message={params.error} />
      <SuccessText message={params.ok} />

      <div className="dispatch-control-row">
        <DateSwitcher basePath={view === "confirm" ? "/confirm" : "/"} dates={knownDates} value={date} />
        <div className="dispatch-summary" aria-label="오늘 일정 요약">
          <div><span>전체</span><strong>{entries.length}</strong></div>
          <div><span>확정</span><strong>{confirmedEntries.length}</strong></div>
          <div><span>완료</span><strong>{doneEntries.length}</strong></div>
        </div>
      </div>

      {view === "request" ? <section id="new-delivery" className="dispatch-inline-register-section"><ScheduleRegisterDialog key={date} inline date={date} regions={regions} vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, vehicleName: vehicle.vehicleName }))} /></section> : null}

      <section className="dispatch-workflow" aria-label="업무 흐름">
        <b>업무 흐름</b>
        <span className={`dispatch-workflow-step ${entries.length ? "dispatch-workflow-step-active" : ""}`}><i>1</i> 납품 등록 · 전체 {entries.length}건</span>
        <span className={`dispatch-workflow-step ${reviewEntries.length ? "dispatch-workflow-step-active" : ""}`}><i>2</i> 추천 확인 · {reviewEntries.length}건</span>
        <span className={`dispatch-workflow-step ${confirmedEntries.length ? "dispatch-workflow-step-active" : ""}`}><i>3</i> 배차 확정 · {confirmedEntries.length}건</span>
        <span className={`dispatch-workflow-step ${doneEntries.length ? "dispatch-workflow-step-active" : ""}`}><i>4</i> 납품 완료 · {doneEntries.length}건</span>
      </section>

      <datalist id="location-options">
        {regions.map((region) => <option key={region.id} value={region.locationName} />)}
      </datalist>

      <div className={`dispatch-workspace${view === "confirm" ? " dispatch-workspace-confirm" : ""}`}>
        <ScheduleSelectionRoot date={date} returnTo={view} allowConfirm={view === "confirm"} entryIds={(view === "request" ? reviewEntries : entries).map((entry) => entry.id)}>
        <section className={`dispatch-board ${view === "confirm" ? "dispatch-board-confirm" : "dispatch-board-request"}`} aria-label={`${formatSheetDate(date)} 배차 보드`}>
          <section className="dispatch-column dispatch-column-review">
            <div className="dispatch-column-head"><div><i /><strong>{view === "confirm" ? "확정 대기" : "배차 신청 내역"}</strong><span>차량과 납품 확인</span></div><b>{reviewEntries.length}</b></div>
            {view === "request" ? <a className="dispatch-secondary-button request-map-link" href="#request-map">지도 보기 ↓</a> : null}
            <div className="dispatch-card-list">
              {reviewEntries.length ? cards(reviewEntries) : <p className="dispatch-column-empty">확인할 추천이 없습니다.</p>}
            </div>
          </section>
          {view === "confirm" ? <section className="dispatch-column dispatch-column-confirmed">
            <div className="dispatch-column-head"><div><i /><strong>배차 확정</strong><span>오늘 출발 예정</span></div><b>{confirmedEntries.length}</b></div>
            <div className="dispatch-card-list">
              {confirmedEntries.length ? cards(confirmedEntries) : <p className="dispatch-column-empty">확정된 배차가 없습니다.</p>}
            </div>
          </section> : null}
          {view === "confirm" ? <section className="dispatch-column dispatch-column-done">
            <div className="dispatch-column-head"><div><i /><strong>납품 완료</strong><span>처리 종료</span></div><b>{doneEntries.length}</b></div>
            <div className="dispatch-card-list">
              {doneEntries.length ? cards(doneEntries) : <p className="dispatch-column-empty">완료된 납품이 없습니다.</p>}
            </div>
          </section> : null}
        </section>
        </ScheduleSelectionRoot>

        {view === "request" ? <aside className="dispatch-side">
          <section className="dispatch-vehicle-panel">
            <h2>잔여 PLT · 차량</h2>
            <p className="dispatch-side-meta">
              중량은 BOX별·시트 PLT 기준 · 1·2호 최대 8 PLT
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
                    </small>
                    <p className={`dispatch-weight${vehicle.weight.overSingleVehicle ? " dispatch-weight-alert" : ""}`}>
                      {vehicle.weight.unknownCount > 0 ? "확인된 중량" : "중량 합계"} {formatNumber(vehicle.weight.kg)}kg / 1대 기준 {vehicle.weight.maxWeight == null ? "미설정" : `${formatNumber(vehicle.weight.maxWeight)}kg`}
                      {vehicle.weight.unknownCount > 0 ? ` · ${vehicle.weight.unknownCount}건 미확인` : ""}
                      {vehicle.weight.estimatedCount > 0 ? ` · ${vehicle.weight.estimatedCount}건 추정` : ""}
                    </p>
                    {vehicle.weight.overSingleVehicle ? <p className="dispatch-weight-warning">합계가 1대 기준을 초과합니다 · 운행별 분할 확인</p> : null}
                    {vehicle.weight.unknownCount > 0 && !vehicle.weight.overSingleVehicle ? <p className="dispatch-weight-warning">미확인 중량이 있어 초과 여부를 확정할 수 없습니다.</p> : null}
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
          <GeumsureFare date={date} />
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
            잔여 PLT를 보고 유동 권역(충청·세종 등)은 1호/2호를 고르세요. 아래 지도에서 거리와 예상 통행료를 확인할 수 있습니다.
          </section>
        </aside> : null}
      </div>
      {view === "request" ? <section className="request-map-section" id="request-map" aria-label="납품 경로 확인" tabIndex={-1}><MapRoutePage embedded searchParams={Promise.resolve({ date, batch: params.batch })} /></section> : null}
    </div>
  );
}
