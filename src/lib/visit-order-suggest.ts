/**
 * 같은 차량 안 방문 순서 초안.
 * 차고에서 시작해 가까운 곳부터(nearest neighbor) 돌고, 소수 스탑은 2-opt로 다듬는다.
 * 직선거리 기준 — 최종 도로 거리·시간은 카카오 길찾기가 다시 계산한다.
 */

export type SuggestStop = { id: string; lat: number; lng: number };

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function tourLengthKm(
  depot: { lat: number; lng: number },
  ordered: SuggestStop[],
): number {
  if (!ordered.length) return 0;
  let km = haversineKm(depot, ordered[0]);
  for (let i = 0; i < ordered.length - 1; i++) {
    km += haversineKm(ordered[i], ordered[i + 1]);
  }
  km += haversineKm(ordered[ordered.length - 1], depot);
  return km;
}

function nearestNeighbor(
  depot: { lat: number; lng: number },
  stops: SuggestStop[],
): SuggestStop[] {
  const remaining = [...stops];
  const ordered: SuggestStop[] = [];
  let current = depot;

  while (remaining.length) {
    let bestIndex = 0;
    let bestKm = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const km = haversineKm(current, remaining[i]);
      if (km < bestKm) {
        bestKm = km;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    current = next;
  }

  return ordered;
}

/** 경로 a→…→b 구간을 뒤집어 거리 단축 여부를 본다. */
function twoOpt(
  depot: { lat: number; lng: number },
  ordered: SuggestStop[],
): SuggestStop[] {
  if (ordered.length < 4) return ordered;
  let best = [...ordered];
  let improved = true;
  let guard = 0;

  while (improved && guard < 40) {
    improved = false;
    guard += 1;
    const bestKm = tourLengthKm(depot, best);

    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const next = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const nextKm = tourLengthKm(depot, next);
        if (nextKm + 1e-6 < bestKm) {
          best = next;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return best;
}

export function suggestVisitOrder(
  depot: { lat: number; lng: number },
  stops: SuggestStop[],
): string[] {
  if (stops.length <= 1) return stops.map((s) => s.id);
  const nn = nearestNeighbor(depot, stops);
  const polished = twoOpt(depot, nn);
  return polished.map((s) => s.id);
}

export function sameOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}
