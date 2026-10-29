/**
 * 자연어에서 파싱한 방문 순서 제약.
 * vehicle이 있으면 해당 호차에만 적용. 없으면 모든 차에 적용.
 */

export type OrderConstraint = {
  type: "early" | "late" | "before";
  match: string;
  other?: string;
  /** 예: "2호", "2호차" — 없으면 전 차량 */
  vehicle?: string | null;
};

/** 차량별 방문 라벨 순서 (자연어로 전체 순서를 말한 경우) */
export type VehicleOrderHint = {
  vehicle: string;
  sequence: string[];
};

export type ParsedRouteConstraints = {
  constraints: OrderConstraint[];
  orders: VehicleOrderHint[];
  /** 아직 자동 반영 안 하는 차량/권역 등 요청 */
  notes: string[];
  summary: string;
};

export type LabeledStop = { id: string; label: string };

function norm(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function vehicleKey(hint: string): string {
  return norm(hint).replace(/호차/g, "호").replace(/호$/, "호");
}

export function constraintAppliesToVehicle(
  constraint: OrderConstraint,
  vehicleName: string,
): boolean {
  if (!constraint.vehicle?.trim()) return true;
  const want = vehicleKey(constraint.vehicle);
  const have = vehicleKey(vehicleName);
  const wantNum = want.match(/\d+/)?.[0];
  const haveNum = have.match(/\d+/)?.[0];
  if (wantNum && haveNum) return wantNum === haveNum;
  return have.includes(want) || want.includes(have);
}

/** 「만도」가 「만도브로제」에 잘못 걸리지 않도록 점수화 */
function matchScore(label: string, match: string): number {
  const full = norm(label);
  const core = norm(label.split("·")[0] ?? label);
  const m = norm(match);
  if (!full || !m) return 0;
  if (full === m || core === m) return 1000;
  if (core.startsWith(m) && core.length > m.length) {
    // 짧은 이름이 긴 이름의 접두이면 약한 매칭 (만도 ⊂ 만도브로제)
    return 100 + m.length;
  }
  if (m.startsWith(core) && m.length > core.length) return 200 + core.length;
  if (full.includes(m)) return 300 + m.length;
  if (m.includes(core)) return 150 + core.length;
  return 0;
}

function findIds(stops: LabeledStop[], match: string): string[] {
  const scored = stops
    .map((stop) => ({ id: stop.id, score: matchScore(stop.label, match) }))
    .filter((row) => row.score > 0);
  if (!scored.length) return [];
  const best = Math.max(...scored.map((row) => row.score));
  // 강한 매칭이 있으면 약한 접두 매칭은 제외
  const threshold = best >= 800 ? 800 : best >= 300 ? 300 : best;
  return scored.filter((row) => row.score >= threshold).map((row) => row.id);
}

/** 거리 추천 순서 위에 early/late/before 제약을 얹는다. */
export function applyOrderConstraints(
  orderIds: string[],
  stops: LabeledStop[],
  constraints: OrderConstraint[],
  vehicleName: string,
): string[] {
  const applicable = constraints.filter((constraint) =>
    constraintAppliesToVehicle(constraint, vehicleName),
  );
  if (!applicable.length || orderIds.length <= 1) return orderIds;

  let order = [...orderIds];
  const known = new Set(orderIds);

  for (const constraint of applicable) {
    if (constraint.type === "early") {
      const hit = new Set(findIds(stops, constraint.match).filter((id) => known.has(id)));
      if (!hit.size) continue;
      order = [...order.filter((id) => hit.has(id)), ...order.filter((id) => !hit.has(id))];
      continue;
    }

    if (constraint.type === "late") {
      const hit = new Set(findIds(stops, constraint.match).filter((id) => known.has(id)));
      if (!hit.size) continue;
      order = [...order.filter((id) => !hit.has(id)), ...order.filter((id) => hit.has(id))];
      continue;
    }

    if (constraint.type === "before") {
      const other = constraint.other?.trim();
      if (!other) continue;
      const aIds = findIds(stops, constraint.match).filter((id) => known.has(id));
      const bIds = findIds(stops, other).filter((id) => known.has(id));
      if (!aIds.length || !bIds.length) continue;
      const aIndex = Math.min(...aIds.map((id) => order.indexOf(id)));
      const bIndex = Math.min(...bIds.map((id) => order.indexOf(id)));
      if (aIndex < bIndex) continue;
      const moving = order.filter((id) => aIds.includes(id));
      order = order.filter((id) => !aIds.includes(id));
      const insertAt = Math.min(
        ...bIds.map((id) => order.indexOf(id)).filter((index) => index >= 0),
      );
      order.splice(insertAt, 0, ...moving);
    }
  }

  for (const id of orderIds) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

/**
 * 차량별 명시 순서(라벨 나열)를 stopId 순서로 변환.
 * 같은 라벨이 여러 개면 앞에서부터 소비한다.
 */
export function resolveExplicitOrder(
  stops: LabeledStop[],
  sequence: string[],
): string[] | null {
  if (!sequence.length || !stops.length) return null;
  const remaining = stops.map((stop) => ({ ...stop }));
  const ordered: string[] = [];

  for (const token of sequence) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < remaining.length; i++) {
      const score = matchScore(remaining[i].label, token);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex < 0 || bestScore < 150) continue;
    const [picked] = remaining.splice(bestIndex, 1);
    ordered.push(picked.id);
  }

  if (!ordered.length) return null;
  for (const stop of remaining) ordered.push(stop.id);
  return ordered;
}

export function findOrderHintForVehicle(
  orders: VehicleOrderHint[],
  vehicleName: string,
): VehicleOrderHint | null {
  return (
    orders.find((order) =>
      constraintAppliesToVehicle({ type: "early", match: "_", vehicle: order.vehicle }, vehicleName),
    ) ?? null
  );
}

function extractVehicle(text: string): { vehicle?: string; rest: string } {
  const matched = text.match(/(\d+)\s*호(?:차)?/);
  if (!matched) return { rest: text };
  return {
    vehicle: `${matched[1]}호`,
    rest: text.replace(matched[0], " ").replace(/\s+/g, " ").trim(),
  };
}

/** Groq 실패 시 키워드 폴백 */
export function parseConstraintsHeuristic(text: string): ParsedRouteConstraints {
  const raw = text.trim();
  if (!raw) {
    return { constraints: [], orders: [], notes: [], summary: "" };
  }

  const { vehicle: topVehicle, rest: body } = extractVehicle(raw);
  const constraints: OrderConstraint[] = [];
  const notes: string[] = [];

  // "A 먼저 ... B 다음/나중"
  const earlyLate = body.match(
    /(.+?)(?:을|를|이|가|은|는)?\s*먼저(?:\s*가고|\s*하고)?\s*(.+?)(?:을|를|이|가|은|는)?\s*(?:다음|나중|뒤에)/,
  );
  if (earlyLate) {
    const earlyMatch = earlyLate[1].replace(/개|두\s*개|\d+\s*개/g, "").trim();
    const lateMatch = earlyLate[2].replace(/개|두\s*개|\d+\s*개/g, "").trim();
    if (earlyMatch) {
      constraints.push({ type: "early", match: earlyMatch, vehicle: topVehicle });
    }
    if (lateMatch) {
      constraints.push({ type: "late", match: lateMatch, vehicle: topVehicle });
    }
  } else {
    const chunks = body
      .split(/[,，/\n]|그리고|및/)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const chunk of chunks) {
      const { vehicle: chunkVehicle, rest } = extractVehicle(chunk);
      const vehicle = chunkVehicle ?? topVehicle;

      if (/먼저|우선|초반|앞에/.test(rest)) {
        const match = rest
          .replace(/은|는|이|가|을|를|먼저|우선|초반|앞에|가고|하고|해|줘|요|\d+\s*개|개/g, " ")
          .trim();
        if (match) constraints.push({ type: "early", match, vehicle });
        continue;
      }
      if (/나중|오후|뒤에|마지막|늦게|다음/.test(rest)) {
        const match = rest
          .replace(
            /은|는|이|가|을|를|나중|오후|뒤에|마지막|늦게|다음|에|해|줘|요|\d+\s*개|개/g,
            " ",
          )
          .trim();
        if (match) constraints.push({ type: "late", match, vehicle });
        continue;
      }
      if (/수도권|지방|만\s*$/.test(rest)) {
        notes.push(chunk);
      }
    }
  }

  const scoped = constraints.filter((c) => c.vehicle).length;
  return {
    constraints,
    orders: [],
    notes,
    summary: constraints.length
      ? `규칙 파싱 ${constraints.length}건${scoped ? ` · ${scoped}건 차량지정` : ""}`
      : notes.length
        ? "차량/권역 요청은 메모만 저장"
        : "해석된 제약 없음",
  };
}
