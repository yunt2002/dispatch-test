import { kakaoMapScriptUrl } from "@/lib/kakao-maps-loader";

/** SDK는 DispatchMap에서 1회 로드. 여기서는 다운로드만 미리 시작한다. */
export default function MapLayout({ children }: { children: React.ReactNode }) {
  const scriptUrl = kakaoMapScriptUrl();
  return (
    <>
      {scriptUrl ? <link rel="preload" as="script" href={scriptUrl} /> : null}
      {children}
    </>
  );
}
