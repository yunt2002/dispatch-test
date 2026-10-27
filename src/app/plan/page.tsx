import { ExcelImportForm } from "@/components/excel-import-form";
import {
  Alert,
  ErrorText,
  NavButton,
  NoticeText,
  PageHeader,
  SuccessText,
} from "@/components/ui";
import { prisma } from "@/lib/prisma";

export default async function PlanUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const excelCount = await prisma.scheduleEntry.count({ where: { source: "EXCEL" } });

  return (
    <div>
      <PageHeader
        title="Excel 처음 가져오기"
        description="기존 납품예상 일정표를 한 번만 가져옵니다. 이후 일정은 홈에서 등록하고, 같은 양식으로 다시 내보냅니다."
        actions={<NavButton href="/" primary>일정 · 배차로</NavButton>}
      />
      <ErrorText message={params.error} />
      <SuccessText message={params.ok} />
      <NoticeText message={params.notice} />

      <Alert variant="info" title="쓰는 방법">
        1) 기존 Excel을 여기로 가져오기 → 2) 홈에서 지역·수량 등록 → 3) Excel 내보내기
      </Alert>
      {excelCount > 0 ? (
        <Alert variant="warn" title="다시 가져오면 엑셀 일정이 교체됩니다">
          지금 엑셀에서 온 일정 {excelCount}건이 이 파일 내용으로 바뀝니다. 홈에서 직접 등록한
          일정은 남습니다.
        </Alert>
      ) : null}

      <ExcelImportForm excelCount={excelCount} />
    </div>
  );
}
