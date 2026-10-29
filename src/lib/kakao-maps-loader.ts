/**
 * 카카오맵 JavaScript SDK 로더 (브라우저 전용).
 * NEXT_PUBLIC_KAKAO_MAP_KEY 만 사용 — REST 키는 여기서 읽지 않는다.
 *
 * autoload=true(기본)로 스크립트를 넣고 Map 생성자가 생길 때까지 폴링한다.
 * maps.load()는 쓰지 않는다(한 번만 콜백·재호출 시 무한 대기 이슈).
 */

const SCRIPT_ID = "kakao-maps-sdk";
const LOAD_TIMEOUT_MS = 20_000;

let loadPromise: Promise<typeof kakao.maps> | null = null;

export function getKakaoMapAppKey(): string | null {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim();
  return key || null;
}

function mapsApiReady(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.kakao?.maps?.Map === "function" &&
    typeof window.kakao.maps.LatLng === "function"
  );
}

function waitForMapsApi(): Promise<typeof kakao.maps> {
  if (mapsApiReady()) return Promise.resolve(window.kakao.maps);

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (mapsApiReady()) {
        window.clearInterval(timer);
        resolve(window.kakao.maps);
        return;
      }
      if (Date.now() - started > LOAD_TIMEOUT_MS) {
        window.clearInterval(timer);
        const host = window.location.host;
        reject(
          new Error(
            `카카오맵 초기화 시간 초과. JavaScript 키인지, 카카오 디벨로퍼스 Web에 ${host} 가 등록됐는지 확인하세요.`,
          ),
        );
      }
    }, 50);
  });
}

function injectScript(appKey: string): Promise<void> {
  if (mapsApiReady() || window.kakao?.maps) {
    // 스크립트는 이미 평가됨(또는 평가 중). 폴링으로 이어간다.
    return Promise.resolve();
  }

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    if (existing.dataset.loaded === "1") return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener(
        "load",
        () => {
          existing.dataset.loaded = "1";
          resolve();
        },
        { once: true },
      );
      existing.addEventListener(
        "error",
        () => reject(new Error("카카오맵 스크립트 로드 오류")),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    // autoload 기본값(true) — 별도 maps.load 불필요
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}`;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error("카카오맵 스크립트 로드 오류"));
    document.head.appendChild(script);
  });
}

export function loadKakaoMaps(): Promise<typeof kakao.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Kakao Maps SDK는 클라이언트에서만 로드됩니다."));
  }

  const appKey = getKakaoMapAppKey();
  if (!appKey) {
    return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 가 없습니다."));
  }

  if (mapsApiReady()) {
    return Promise.resolve(window.kakao.maps);
  }
  if (loadPromise) return loadPromise;

  loadPromise = injectScript(appKey)
    .then(() => waitForMapsApi())
    .catch((error) => {
      loadPromise = null;
      throw error;
    });

  return loadPromise;
}
