import { KakaoSdkPreload } from "@/components/kakao-map/kakao-sdk-preload";
import { kakaoMapScriptUrl } from "@/lib/kakao-maps-loader";

export default function MapLayout({ children }: { children: React.ReactNode }) {
  const scriptUrl = kakaoMapScriptUrl();
  return (
    <>
      {scriptUrl ? <link rel="preload" as="script" href={scriptUrl} /> : null}
      <KakaoSdkPreload />
      {children}
    </>
  );
}
