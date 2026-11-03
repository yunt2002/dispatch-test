/** 엑셀에 명시된 시·군과 등록 주소가 다른 경우만 불일치로 본다. */
export function simulationAddressIssue(location: string, address: string | null): string | null {
  if (!address?.trim()) return "등록 주소 없음";
  const raw = location.trim().replace(/\s+/g, "").replace(/(?:시|군|구)$/, "");
  const known = new Set(["서울", "인천", "수원", "성남", "용인", "고양", "부천", "안산", "안양", "화성", "평택", "시흥", "김포", "광주", "아산", "서산", "세종", "천안", "청주", "충주", "대전", "대구", "부산", "울산", "울주", "창원", "김해", "진해", "거창", "완주", "전주", "군산", "익산", "여수", "순천", "목포", "포항", "경주", "구미", "제주"]);
  if (!known.has(raw)) return null;
  if (!address.replace(/\s+/g, "").includes(raw)) return `엑셀 지역 ${location.trim()}와 등록 주소가 다릅니다`;
  return null;
}
