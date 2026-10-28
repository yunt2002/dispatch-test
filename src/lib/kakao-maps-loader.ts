/**
 * 카카오맵 JavaScript SDK 로더 (브라우저 전용).
 * NEXT_PUBLIC_KAKAO_MAP_KEY 만 사용 — REST 키는 여기서 읽지 않는다.
 */

const SCRIPT_ID = "kakao-maps-sdk";
const LOAD_TIMEOUT_MS = 12_000;

let loadPromise: Promise<typeof kakao.maps> | null = null;

export function getKakaoMapAppKey(): string | null {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim();
  return key || null;
}

export function kakaoMapScriptUrl(): string | null {
  const key = getKakaoMapAppKey();
  if (!key) return null;
  return `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
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

function waitForKakaoMaps(): Promise<typeof kakao.maps> {
  return new Promise((resolve, reject) => {
    if (!window.kakao?.maps?.load) {
      reject(new Error("카카오맵 SDK가 초기화되지 않았습니다. JavaScript 키·웹 도메인을 확인하세요."));
      return;
    }
    try {
      window.kakao.maps.load(() => {
        if (!window.kakao?.maps) {
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

export function loadKakaoMaps(): Promise<typeof kakao.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Kakao Maps SDK는 클라이언트에서만 로드됩니다."));
  }

  const appKey = getKakaoMapAppKey();
  if (!appKey) {
    return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 가 없습니다."));
  }

  if (window.kakao?.maps) {
    return withTimeout(
      waitForKakaoMaps(),
      LOAD_TIMEOUT_MS,
      "카카오맵 초기화가 지연됩니다. NEXT_PUBLIC_KAKAO_MAP_KEY가 JavaScript 키인지, 카카오 디벨로퍼스에 localhost 도메인이 등록됐는지 확인하세요.",
    );
  }

  if (loadPromise) return loadPromise;

  loadPromise = withTimeout(
    new Promise<typeof kakao.maps>((resolve, reject) => {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

      const fail = (message: string) => {
        loadPromise = null;
        reject(new Error(message));
      };

      const onScriptReady = () => {
        waitForKakaoMaps().then(resolve, (error) => {
          loadPromise = null;
          reject(error);
        });
      };

      if (existing) {
        if (window.kakao?.maps) {
          onScriptReady();
          return;
        }
        // load 이벤트를 이미 놓친 경우 대비
        if ((existing as HTMLScriptElement & { dataset: DOMStringMap }).dataset.loaded === "1") {
          fail("카카오맵 스크립트는 있으나 SDK 객체가 없습니다. JavaScript 키를 확인하세요.");
          return;
        }
        existing.addEventListener("load", onScriptReady, { once: true });
        existing.addEventListener(
          "error",
          () => fail("카카오맵 스크립트 로드 오류"),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = kakaoMapScriptUrl() ?? "";
      script.onload = () => {
        script.dataset.loaded = "1";
        onScriptReady();
      };
      script.onerror = () => fail("카카오맵 스크립트 로드 오류");
      document.head.appendChild(script);
    }),
    LOAD_TIMEOUT_MS,
    "카카오맵 로딩 시간 초과. JavaScript 키(REST 키 아님)와 플랫폼 도메인(예: http://localhost:3000) 등록을 확인하세요.",
  ).catch((error) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}
