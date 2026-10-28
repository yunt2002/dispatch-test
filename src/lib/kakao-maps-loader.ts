/**
 * 카카오맵 JavaScript SDK 로더 (브라우저 전용).
 * NEXT_PUBLIC_KAKAO_MAP_KEY 만 사용 — REST 키는 여기서 읽지 않는다.
 *
 * autoload=false 에서 maps.load()는 한 번만 성공한다.
 * 이미 준비됐으면 즉시 반환하고, 진행 중이면 같은 Promise를 공유한다.
 */

const SCRIPT_ID = "kakao-maps-sdk";
const LOAD_TIMEOUT_MS = 15_000;

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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function callMapsLoadOnce(): Promise<typeof kakao.maps> {
  if (mapsApiReady()) return Promise.resolve(window.kakao.maps);

  return new Promise((resolve, reject) => {
    if (!window.kakao?.maps?.load) {
      reject(
        new Error("카카오맵 SDK가 초기화되지 않았습니다. JavaScript 키·웹 도메인을 확인하세요."),
      );
      return;
    }
    try {
      window.kakao.maps.load(() => {
        if (!mapsApiReady()) {
          reject(new Error("카카오맵 SDK 로드 실패"));
          return;
        }
        resolve(window.kakao.maps);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("카카오맵 SDK 로드 실패"));
    }
  });
}

function injectScript(appKey: string): Promise<void> {
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    if (typeof window.kakao?.maps?.load === "function") return Promise.resolve();
    if (existing.dataset.loaded === "1") {
      return Promise.reject(
        new Error("카카오맵 스크립트는 있으나 SDK 객체가 없습니다. JavaScript 키를 확인하세요."),
      );
    }
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
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
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
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

  loadPromise = withTimeout(
    injectScript(appKey).then(() => callMapsLoadOnce()),
    LOAD_TIMEOUT_MS,
    "카카오맵 로딩 시간 초과. JavaScript 키와 카카오 디벨로퍼스 Web 도메인(Vercel 주소)을 확인하세요.",
  ).catch((error) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}
