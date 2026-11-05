import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { historyMetrics, markLegacyStariaRecord, validHistorySnapshot, type SimulationHistoryRecord } from "@/lib/simulation-history";

const PREFIX = "simulation_history:v1:";
const SELECTION = "simulation_history_selection:v1:";
const keyPattern = /^simulation_history:v1:\d{4}-\d{2}-\d{2}:[0-9a-f-]{36}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (id) {
      if (!keyPattern.test(id)) return NextResponse.json({ error: "기록 번호가 올바르지 않습니다." }, { status: 400 });
      const entry = await prisma.appSetting.findUnique({ where: { key: id } });
      if (!entry) return NextResponse.json({ error: "분석 기록을 찾을 수 없습니다." }, { status: 404 });
      const record = JSON.parse(entry.value) as SimulationHistoryRecord;
      if (!validHistorySnapshot(record.snapshot)) return NextResponse.json({ error: "저장된 기록을 읽을 수 없습니다." }, { status: 422 });
      return NextResponse.json(markLegacyStariaRecord(record));
    }
    const before = params.get("before");
    if (before && !keyPattern.test(before)) return NextResponse.json({ error: "이전 기록 번호가 올바르지 않습니다." }, { status: 400 });
    const [entries, selections] = await Promise.all([
      prisma.appSetting.findMany({ where: { key: { startsWith: PREFIX, ...(before ? { lt: before } : {}) } }, orderBy: { key: "desc" }, take: 101 }),
      prisma.appSetting.findMany({ where: { key: { startsWith: SELECTION } } }),
    ]);
    const selected = Object.fromEntries(selections.map((entry) => [entry.key.slice(SELECTION.length), entry.value]));
    const records = entries.slice(0, 100).flatMap((entry) => {
      try {
        const record = JSON.parse(entry.value) as SimulationHistoryRecord;
        if (!validHistorySnapshot(record.snapshot)) return [];
        const { snapshot, metrics, savedAt } = markLegacyStariaRecord(record);
        return [{ id: entry.key, date: snapshot.date, fileName: snapshot.fileName, savedAt, review: snapshot.review, planSource: snapshot.result.planSource ?? "미확인", metrics }];
      } catch { return []; }
    }).sort((a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt));
    return NextResponse.json({ records, selected, nextCursor: entries.length > 100 ? entries[99].key : null });
  } catch { return NextResponse.json({ error: "분석 기록을 불러오지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 2_000_000) return NextResponse.json({ error: "분석 기록이 너무 큽니다." }, { status: 413 });
    const text = await request.text();
    if (text.length > 2_000_000) return NextResponse.json({ error: "분석 기록이 너무 큽니다." }, { status: 413 });
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "요청 형식을 확인하세요." }, { status: 400 });
    const value = body as { action?: unknown; snapshot?: unknown; date?: unknown; id?: unknown };
    if (value.action === "save") {
      if (!validHistorySnapshot(value.snapshot)) return NextResponse.json({ error: "분석 기록의 내용과 조건을 확인하세요." }, { status: 400 });
      const id = `${PREFIX}${value.snapshot.date}:${randomUUID()}`;
      const record: SimulationHistoryRecord = { id, savedAt: new Date().toISOString(), snapshot: value.snapshot, metrics: historyMetrics(value.snapshot) };
      await prisma.appSetting.create({ data: { key: id, value: JSON.stringify(record) } });
      return NextResponse.json({ id, savedAt: record.savedAt });
    }
    if (value.action === "select") {
      if (typeof value.date !== "string" || !datePattern.test(value.date) || !(value.id === null || (typeof value.id === "string" && keyPattern.test(value.id) && value.id.startsWith(`${PREFIX}${value.date}:`)))) return NextResponse.json({ error: "선택할 날짜와 기록을 확인하세요." }, { status: 400 });
      if (value.id && !await prisma.appSetting.findUnique({ where: { key: value.id } })) return NextResponse.json({ error: "분석 기록을 찾을 수 없습니다." }, { status: 404 });
      const key = `${SELECTION}${value.date}`;
      await prisma.appSetting.upsert({ where: { key }, create: { key, value: value.id ?? "" }, update: { value: value.id ?? "" } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "요청 형식을 확인하세요." }, { status: 400 });
  } catch { return NextResponse.json({ error: "분석 기록을 처리하지 못했습니다." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "요청 형식을 확인하세요." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "요청 형식을 확인하세요." }, { status: 400 });
  const value = body as { all?: unknown; ids?: unknown };
  const all = value.all === true && value.ids === undefined;
  const ids = value.ids;
  if (!all && (value.all !== undefined || !Array.isArray(ids) || ids.length === 0 || ids.length > 1000 || !ids.every((id) => typeof id === "string" && keyPattern.test(id)))) return NextResponse.json({ error: "삭제할 기록을 확인하세요." }, { status: 400 });
  try {
    const uniqueIds = all ? [] : [...new Set(ids as string[])];
    const [deleted] = await prisma.$transaction([
      prisma.appSetting.deleteMany({ where: { key: all ? { startsWith: PREFIX } : { in: uniqueIds } } }),
      prisma.appSetting.deleteMany({ where: { key: { startsWith: SELECTION }, ...(all ? {} : { value: { in: uniqueIds } }) } }),
    ]);
    return NextResponse.json({ deleted: deleted.count });
  } catch { return NextResponse.json({ error: "분석 기록을 삭제하지 못했습니다." }, { status: 500 }); }
}
