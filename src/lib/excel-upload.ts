const EXCEL_UPLOAD_MAX_MB = 4;

export const EXCEL_UPLOAD_SIZE_LABEL = `최대 ${EXCEL_UPLOAD_MAX_MB} MB`;

export function excelUploadError(file: Pick<File, "name" | "size">): string | null {
  if (!/\.xlsx$/i.test(file.name)) return "엑셀 파일을 .xlsx 형식으로 저장한 뒤 올려 주세요.";
  if (file.size === 0) return "내용이 있는 엑셀 파일을 선택해 주세요.";
  if (file.size > EXCEL_UPLOAD_MAX_MB * 1_000_000) return `엑셀 파일은 ${EXCEL_UPLOAD_SIZE_LABEL}까지 올릴 수 있습니다.`;
  return null;
}
