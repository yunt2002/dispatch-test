/** 참고 연비. 차량별 실제 적재·주행 조건에 맞게 화면에서 수정할 수 있다. */
export function defaultFuelEconomy(vehicleName: string): {
  kmPerLiter: number;
  note: string;
} | null {
  const name = vehicleName.replace(/\s/g, "");
  if (/^1호(차)?$/.test(name)) {
    return { kmPerLiter: 7.1, note: "임시 추정 · 3.5톤 실측 사례를 4톤에 적용, 실제 연비 확인 필요" };
  }
  if (/^2호(차)?$/.test(name)) {
    return { kmPerLiter: 7.1, note: "임시 추정 · 3.5톤 마이티 윙바디 1대의 실측 사례" };
  }
  if (name === "스타리아") {
    return { kmPerLiter: 11.6, note: "참고 · 2023 스타리아 카고 3인승 디젤 2WD 자동 복합연비, 사양 확인 필요" };
  }
  return null;
}
