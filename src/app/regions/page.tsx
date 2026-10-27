import { ConfirmSubmit } from "@/components/confirm-submit";
import { ErrorText, FieldHint, PageHeader, SuccessText } from "@/components/ui";
import { regionTypeLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { optionalText, text } from "@/lib/form";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function upsertRegion(formData: FormData) {
  "use server";
  const id = optionalText(formData, "id");
  const locationName = text(formData, "locationName");
  const regionType = text(formData, "regionType");
  const preferredVehicleTypeId = optionalText(formData, "preferredVehicleTypeId");
  if (!locationName || !regionType) {
    redirect("/regions?error=" + encodeURIComponent("위치와 수도권/지방은 필수입니다."));
  }
  const data = {
    locationName,
    regionType,
    preferredVehicleTypeId,
    notes: optionalText(formData, "notes"),
  };
  try {
    if (id) await prisma.regionMaster.update({ where: { id }, data });
    else await prisma.regionMaster.create({ data });
  } catch {
    redirect("/regions?error=" + encodeURIComponent("위치명이 중복되었거나 저장에 실패했습니다."));
  }
  revalidatePath("/regions");
  redirect("/regions?ok=" + encodeURIComponent("지역을 저장했습니다."));
}

async function deleteRegion(formData: FormData) {
  "use server";
  const id = text(formData, "id");
  await prisma.regionMaster.delete({ where: { id } });
  revalidatePath("/regions");
  redirect("/regions?ok=" + encodeURIComponent("삭제했습니다."));
}

export default async function RegionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; edit?: string }>;
}) {
  const params = await searchParams;
  const [regions, vehicles, editing] = await Promise.all([
    prisma.regionMaster.findMany({ orderBy: [{ regionType: "asc" }, { locationName: "asc" }] }),
    prisma.vehicleType.findMany({ where: { isActive: true } }),
    params.edit ? prisma.regionMaster.findUnique({ where: { id: params.edit } }) : null,
  ]);

  return (
    <div>
      <PageHeader
        title="지역"
        description="위치 이름과 수도권/지방 구분입니다. 추천 차량이 여기서 갈립니다."
      />
      <ErrorText message={params.error} />
      <SuccessText message={params.ok} />
      <form action={upsertRegion} className="card mb-4 p-4">
        {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
        <h2 className="mb-3 text-base font-bold">{editing ? "지역 수정" : "지역 등록"}</h2>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="locationName">위치 *</label>
            <input
              id="locationName"
              className="input"
              name="locationName"
              defaultValue={editing?.locationName ?? ""}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="regionType">수도권/지방 *</label>
            <select
              id="regionType"
              className="select"
              name="regionType"
              defaultValue={editing?.regionType ?? "METROPOLITAN"}
            >
              <option value="METROPOLITAN">수도권</option>
              <option value="LOCAL">지방</option>
              <option value="EMERGENCY">긴급납품</option>
              <option value="UNKNOWN">미분류</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="preferredVehicleTypeId">선호 차량</label>
            <select
              id="preferredVehicleTypeId"
              className="select"
              name="preferredVehicleTypeId"
              defaultValue={editing?.preferredVehicleTypeId ?? ""}
            >
              <option value="">없음</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.vehicleName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field mt-3">
          <label htmlFor="notes">메모</label>
          <textarea id="notes" className="textarea" name="notes" defaultValue={editing?.notes ?? ""} />
        </div>
        <div className="mt-3">
          <button className="btn btn-primary" type="submit">
            저장
          </button>
        </div>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>위치</th>
            <th>수도권/지방</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {regions.map((region) => (
            <tr key={region.id}>
              <td>{region.locationName}</td>
              <td>{regionTypeLabel(region.regionType)}</td>
              <td>
                <div className="flex gap-2">
                  <a className="btn" href={`/regions?edit=${region.id}`}>
                    수정
                  </a>
                  <ConfirmSubmit action={deleteRegion} id={region.id} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <FieldHint>목록에 없는 위치는 미분류로 두고, 차는 추천합니다.</FieldHint>
    </div>
  );
}
