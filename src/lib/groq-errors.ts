/** API 상태 코드만 안내하며 응답 본문이나 인증 정보는 노출하지 않는다. */
export function groqHttpError(status: number): string {
  if (status === 401 || status === 403) return `Groq 인증 또는 권한 오류 (HTTP ${status})`;
  if (status === 429) return "Groq 요청 한도 초과 (HTTP 429). 잠시 후 다시 시도하세요.";
  if (status >= 500) return `Groq 서버 오류 (HTTP ${status}). 잠시 후 다시 시도하세요.`;
  return `Groq 요청 실패 (HTTP ${status}). 모델 및 요청 설정을 확인하세요.`;
}

export function groqException(error: unknown): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "Groq 응답 시간 초과. 다시 시도하세요.";
  if (error instanceof SyntaxError) return "Groq 응답 형식을 읽지 못했습니다. 다시 시도하세요.";
  return "Groq 연결 또는 응답 처리에 실패했습니다. 다시 시도하세요.";
}
