import { NextRequest } from "next/server";
import {
  buildAllSheetsWorkbook,
  buildDeliveryWorkbook,
  monthRange,
  monthSheetName,
} from "@/lib/delivery-export";
import { todayISO } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "month";
  const date = request.nextUrl.searchParams.get("date");

  if (scope === "all") {
    const entries = await prisma.scheduleEntry.findMany({
      where: { status: { not: "CANCELLED" } },
      orderBy: [{ deliveryDate: "asc" }, { createdAt: "asc" }],
    });
    const buffer = await buildAllSheetsWorkbook(entries, date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO());
    const filename = "납품예상 일정표 및 납품관리.xlsx";
    const encoded = encodeURIComponent(filename);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="schedule.xlsx"; filename*=UTF-8''${encoded}`,
      },
    });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("date 쿼리가 필요합니다. (YYYY-MM-DD)", { status: 400 });
  }

  const { start, end } = monthRange(date);
  const entries = await prisma.scheduleEntry.findMany({
    where: {
      deliveryDate: { gte: start, lte: end },
      status: { not: "CANCELLED" },
    },
    orderBy: [{ deliveryDate: "asc" }, { createdAt: "asc" }],
  });

  const buffer = await buildDeliveryWorkbook(date, entries);
  const filename = `납품예상 일정표 및 납품관리 ${monthSheetName(date)}.xlsx`;
  const encoded = encodeURIComponent(filename);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="schedule.xlsx"; filename*=UTF-8''${encoded}`,
    },
  });
}
