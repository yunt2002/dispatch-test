export type MapRouteStrokeStyle = "solid" | "dashed" | "shortdash" | "longdash";

export type MapRouteVisualStyle = {
  color: string;
  strokeStyle: MapRouteStrokeStyle;
  strokeWeight: number;
  strokeOpacity: number;
  kind: "own" | "charter" | "other";
};

const OWN_BY_NAME: { match: RegExp; color: string }[] = [
  { match: /1\s*호/, color: "#5b21b6" }, // 보라 — 1호차
  { match: /2\s*호/, color: "#0f766e" }, // 청록 — 2호차
  { match: /3\s*호/, color: "#1d4ed8" }, // 파랑
  { match: /스타리|staria/i, color: "#0369a1" },
];

const CHARTER_COLORS = ["#c2410c", "#a16207", "#be123c", "#9a3412", "#b45309"];
const OTHER_COLORS = ["#15803d", "#7c3aed", "#0e7490", "#4d7c0f"];

export function mapRouteKind(vehicleName: string): MapRouteVisualStyle["kind"] {
  if (/용차|charter/i.test(vehicleName)) return "charter";
  if (/호\s*차|호\s*차량|스타리|staria/i.test(vehicleName)) return "own";
  return "other";
}

/** 자사=굵은 실선·고정색, 용차=얇은 점선·따뜻한 색. */
export function resolveMapRouteStyle(vehicleName: string, index: number): MapRouteVisualStyle {
  const kind = mapRouteKind(vehicleName);
  if (kind === "own") {
    const matched = OWN_BY_NAME.find((row) => row.match.test(vehicleName));
    return {
      kind,
      color: matched?.color ?? OTHER_COLORS[index % OTHER_COLORS.length],
      strokeStyle: "solid",
      strokeWeight: 7,
      strokeOpacity: 0.92,
    };
  }
  if (kind === "charter") {
    return {
      kind,
      color: CHARTER_COLORS[index % CHARTER_COLORS.length],
      strokeStyle: "dashed",
      strokeWeight: 4,
      strokeOpacity: 0.88,
    };
  }
  return {
    kind,
    color: OTHER_COLORS[index % OTHER_COLORS.length],
    strokeStyle: "solid",
    strokeWeight: 5,
    strokeOpacity: 0.85,
  };
}

/** 같은 고속도로를 탈 때 겹침을 줄이려고 경로를 아주 조금만 옆으로 민다. */
export function offsetMapPath(
  path: { lat: number; lng: number; label?: string }[],
  index: number,
  total: number,
): { lat: number; lng: number; label?: string }[] {
  if (total <= 1 || path.length < 2) return path;
  const stepMeters = 55;
  const centered = index - (total - 1) / 2;
  if (Math.abs(centered) < 0.01) return path;
  const meters = centered * stepMeters;
  const latRad = (path[0].lat * Math.PI) / 180;
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.max(0.2, Math.cos(latRad)));
  // 진행 방향에 수직이 아니라 고정 대각 오프셋 — 겹침만 완화
  return path.map((point) => ({
    ...point,
    lat: point.lat + dLat * 0.35,
    lng: point.lng + dLng,
  }));
}

export function withMapRouteStyles<T extends { vehicleName: string; color?: string }>(
  routes: T[],
): (T & MapRouteVisualStyle)[] {
  return routes.map((route, index) => {
    const style = resolveMapRouteStyle(route.vehicleName, index);
    return { ...route, ...style, color: style.color };
  });
}
