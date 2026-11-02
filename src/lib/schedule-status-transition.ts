type Operation = "done" | "reopen";
type Status = "CONFIRMED" | "DONE";
type UpdateArgs = { where: { id: string; deliveryDate: string; status: Status }; data: { status: Status } };

/** 상태 조건을 포함한 단일 DB 갱신으로 중복 요청과 오래된 화면을 방어한다. */
export async function transitionScheduleStatus(
  repository: { updateMany(args: UpdateArgs): Promise<{ count: number }> },
  id: string,
  deliveryDate: string,
  operation: Operation,
): Promise<boolean> {
  const from: Status = operation === "done" ? "CONFIRMED" : "DONE";
  const to: Status = operation === "done" ? "DONE" : "CONFIRMED";
  const result = await repository.updateMany({ where: { id, deliveryDate, status: from }, data: { status: to } });
  return result.count === 1;
}
