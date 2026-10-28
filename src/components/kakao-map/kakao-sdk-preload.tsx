"use client";

import { useEffect } from "react";
import { getKakaoMapAppKey, loadKakaoMaps } from "@/lib/kakao-maps-loader";

/** 지도 페이지 진입 시 SDK 다운로드를 마커 렌더보다 먼저 시작한다. */
export function KakaoSdkPreload() {
  useEffect(() => {
    if (!getKakaoMapAppKey()) return;
    void loadKakaoMaps().catch(() => {
      /* DispatchMap이 같은 오류를 표시한다 */
    });
  }, []);
  return null;
}
