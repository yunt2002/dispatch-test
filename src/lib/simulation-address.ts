/** 항만명만 주어진 경우의 임시 비교 지점. 실제 화물 반입지는 별도 확인한다. */
export function simulationPortReference(location: string): { name: string; address: string } | null {
  const area = location.trim().replace(/\s+/g, "");
  if (area === "인천항") return { name: "인천항", address: "인천광역시 제물포구 항동7가 27-171" };
  if (area === "부산항") return { name: "부산항", address: "부산광역시 동구 충장대로 206" };
  return null;
}

/** 엑셀에 명시된 시·군과 등록 주소가 다른 경우만 불일치로 본다. */
export function correctedSimulationLocation(customer: string, location: string): string {
  const name = customer.trim().replace(/\s+/g, "").toLowerCase();
  const area = location.trim().replace(/\s+/g, "");
  if ((name === "한국프레틀" || name === "한국에프아이티볼테라(한국프레틀)") && ["의왕", "의왕시"].includes(area)) return "안양";
  return location;
}

export function confirmedSimulationAddress(customer: string, location: string): string | null {
  const name = customer.trim().replace(/\s+/g, "").toLowerCase();
  const area = location.trim().replace(/\s+/g, "");
  if (name === "대양자석" && ["대구", "대구시", "대구광역시"].includes(area)) return "대구광역시 달서구 성서공단남로10길 24";
  if ((name === "현대엘리베이터" || name === "현대엘리베이터(비전모터)") && ["인천", "인천시", "인천광역시"].includes(area)) return "인천광역시 남동구 남동서로 311";
  if (name === "코아비스" && ["세종", "세종시", "세종특별자치시"].includes(area)) return "세종특별자치시 연서면 공단로 117";
  if ((name === "디아이씨" || name === "dic") && (area === "울주" || area === "울주군")) return "울산광역시 울주군 상북면 길천산업로 401";
  if (name === "지엠비코리아" && (area === "창원" || area === "창원시")) return "경상남도 창원시 성산구 웅남로 618";
  if ((name === "엘지이노텍(삼현)" || name === "lgit(삼현)") && (area === "창원" || area === "창원시")) return "경상남도 창원시 의창구 죽전로 45";
  if ((name === "한국프레틀" || name === "한국에프아이티볼테라(한국프레틀)") && ["", "안양", "안양시", "경기안양", "경기안양시", "경기도안양", "경기도안양시", "경기도안양시만안구", "경기안양시만안구"].includes(area)) return "경기도 안양시 만안구 덕천로152번길 25";
  return null;
}

export function simulationAddressIssue(location: string, address: string | null): string | null {
  if (!address?.trim()) return "등록 주소 없음";
  const normalized = location.trim().replace(/\s+/g, "");
  const raw = (normalized === "인천항" ? "인천" : normalized === "부산항" ? "부산" : normalized).replace(/(?:시|군|구)$/, "");
  const known = new Set(["서울", "인천", "수원", "성남", "용인", "고양", "부천", "안산", "안양", "화성", "평택", "시흥", "김포", "광주", "아산", "서산", "세종", "천안", "청주", "충주", "대전", "대구", "부산", "울산", "울주", "창원", "김해", "진해", "거창", "완주", "전주", "군산", "익산", "여수", "순천", "목포", "포항", "경주", "구미", "제주"]);
  if (!known.has(raw)) return null;
  if (!address.replace(/\s+/g, "").includes(raw)) return `엑셀 지역 ${location.trim()}와 등록 주소가 다릅니다`;
  return null;
}
