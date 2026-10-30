/** 배차 지도에 표시할 고객사(납품지) 마커 — 좌표는 서버에서 해석 */
export type DispatchMapMarker = {
  id: string;
  title: string;
  subtitle?: string;
  lat: number;
  lng: number;
  items?: { id: string; productName: string; quantityLabel: string }[];
};

/** OR-Tools 제안 경로 (지도 폴리라인용) */
export type DispatchMapRoute = {
  vehicleId: string;
  vehicleName: string;
  color: string;
  /** 방문 순서 좌표 (차고 포함 가능) */
  path: { lat: number; lng: number; label?: string }[];
};
