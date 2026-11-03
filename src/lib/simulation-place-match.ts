import { simulationAddressIssue } from "./simulation-address";

type Place = { place_name?: string; road_address_name?: string; address_name?: string; x?: string; y?: string };
function nameKey(value: string) { return value.toLowerCase().replace(/\(주\)|주식회사/g, "").replace(/[^가-힣a-z0-9]/g, ""); }

/** 업체명과 엑셀 지역이 모두 일치하는 단일 장소만 후보로 사용한다. */
export function uniqueCompanyPlace(customer: string, location: string, places: Place[], isEnd: boolean) {
  const name = nameKey(customer);
  const city = location.trim().replace(/\s+/g, "").replace(/(?:시|군|구)$/, "");
  // 광주는 동명이므로 엑셀 지역명만으로 광주시와 광주광역시를 구분할 수 없다.
  if (!isEnd || name.length < 2 || !location.trim() || /^광주(?:시)?$/.test(location.trim())) return null;
  const matches = places.flatMap((place) => {
    const address = (place.road_address_name || place.address_name || "").trim();
    const lat = Number(place.y), lng = Number(place.x);
    if (nameKey(place.place_name || "") !== name || !address || !city || !address.replace(/\s+/g, "").includes(city) || simulationAddressIssue(location, address) || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) return [];
    return [{ address, lat, lng }];
  });
  const unique = [...new Map(matches.map((place) => [`${place.lat},${place.lng}`, place])).values()];
  return unique.length === 1 ? unique[0] : null;
}
