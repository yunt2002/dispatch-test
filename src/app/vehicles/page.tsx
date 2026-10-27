import { ConfirmSubmit } from "@/components/confirm-submit";
import { ErrorText, FieldHint, PageHeader, SuccessText } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { regionTypeLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { deleteVehicle, upsertVehicle } from "./actions";

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; edit?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const [vehicles, editing] = await Promise.all([
    prisma.vehicleType.findMany({ orderBy: { maxWeight: "asc" } }),
    params.edit ? prisma.vehicleType.findUnique({ where: { id: params.edit } }) : null,
  ]);

  return (
    <div>
      <PageHeader
        title="차량"
        description="1호차·2호차·3호차·스타리아의 적재한도와 지역 용도입니다."
      />
      <ErrorText message={params.error} />
      <SuccessText message={params.ok} />

      <form action={upsertVehicle} className="card mb-4 p-4">
        {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
        <h2 className="mb-3 text-base font-bold">{editing ? "차량 수정" : "차량 등록"}</h2>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="vehicleName">차량 이름 *</label>
            <input
              id="vehicleName"
              className="input"
              name="vehicleName"
              defaultValue={editing?.vehicleName ?? ""}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="maxWeight">최대 적재량(kg) *</label>
            <input
              id="maxWeight"
              className="input"
              name="maxWeight"
              inputMode="decimal"
              defaultValue={editing?.maxWeight ?? ""}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="maxPallet">최대 PLT *</label>
            <input
              id="maxPallet"
              className="input"
              name="maxPallet"
              inputMode="decimal"
              defaultValue={editing?.maxPallet ?? ""}
              required
            />
            <FieldHint>1·2호 8 / 3호 2 / 스타리아 1</FieldHint>
          </div>
          <div className="field">
            <label htmlFor="primaryRegionType">주 용도 지역</label>
            <select
              id="primaryRegionType"
              className="select"
              name="primaryRegionType"
              defaultValue={editing?.primaryRegionType ?? "ANY"}
            >
              <option value="LOCAL">지방</option>
              <option value="METROPOLITAN">수도권</option>
              <option value="EMERGENCY">긴급납품</option>
              <option value="ANY">전체</option>
            </select>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            defaultChecked={editing?.priorityType === "EMERGENCY"}
            name="isEmergency"
            type="checkbox"
          />
          긴급 배차용 (3호차·스타리아)
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="boxPreferred" defaultChecked={editing?.boxPreferred ?? false} />
          소량·박스 우선 (스타리아)
        </label>
        <div className="field mt-3">
          <label htmlFor="description">설명</label>
          <textarea
            id="description"
            className="textarea"
            name="description"
            defaultValue={editing?.description ?? ""}
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} />
          사용
        </label>
        <div className="mt-3">
          <button className="btn btn-primary" type="submit">
            저장
          </button>
        </div>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>차량</th>
            <th>톤(kg)</th>
            <th>PLT</th>
            <th>지역</th>
            <th>상태</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {vehicles.map((vehicle) => (
            <tr key={vehicle.id}>
              <td>
                {vehicle.vehicleName}{" "}
                {vehicle.priorityType === "EMERGENCY" ? (
                  <span className="badge badge-info">긴급</span>
                ) : null}{" "}
                {vehicle.boxPreferred ? <span className="badge badge-info">소량</span> : null}
              </td>
              <td>{formatNumber(vehicle.maxWeight)}</td>
              <td>{vehicle.maxPallet == null ? "-" : formatNumber(vehicle.maxPallet)}</td>
              <td>{regionTypeLabel(vehicle.primaryRegionType)}</td>
              <td>{vehicle.isActive ? "사용" : "중지"}</td>
              <td>
                <div className="flex gap-2">
                  <a className="btn" href={`/vehicles?edit=${vehicle.id}`}>
                    수정
                  </a>
                  <ConfirmSubmit action={deleteVehicle} id={vehicle.id} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
