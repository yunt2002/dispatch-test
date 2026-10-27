import { buildDispatchWorkbook } from "@/lib/excel";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (!date) {
    return new Response("date 쿼리가 필요합니다.", { status: 400 });
  }

  const buffer = await buildDispatchWorkbook(date);
  const filename = `dispatch-${date}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
