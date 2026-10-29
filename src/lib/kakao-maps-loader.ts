/**
 * 카카오맵 JavaScript SDK 로더 (브라우저 전용).
 * NEXT_PUBLIC_KAKAO_MAP_KEY 만 사용 — REST 키는 여기서 읽지 않는다.
 *
 * 어제 동작하던 autoload=false + maps.load 패턴을 유지하되,
 * Map 이 이미 준비되면 즉시 반환하고 maps.load 는 한 번만 호출한다.
 */

const SCRIPT_ID = "kakao-maps-sdk";
const LOAD_TIMEOUT_MS = 15_000;

let loadPromise: Promise<typeof kakao.maps> | null = null;
let mapsLoadCalled = false;

export function getKakaoMapAppKey(): string | null {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim();
  return key || null;
}

function mapsApiReady(): boolean {
  return typeof window.kakao?.maps?.Map === "function";
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
  if (mapsApiReady()) return Promise.resolve(window.kakao.maps);

  return new Promise((resolve, reject) => {
    if (typeof window.kakao?.maps?.load !== "function") {
      reject(
        new Error("카카오맵 SDK가 초기화되지 않았습니다. JavaScript 키·웹 도메인을 확인하세요."),
      );
      return;
    }

    const started = Date.now();
    const timer = window.setInterval(() => {
      if (mapsApiReady()) {
        window.clearInterval(timer);
        resolve(window.kakao.maps);
        return;
      }
      if (Date.now() - started > LOAD_TIMEOUT_MS) {
        window.clearInterval(timer);
        reject(
          new Error(
            `카카오맵 초기화 시간 초과 (${window.location.host}). JavaScript 키·Web 도메인을 확인하세요.`,
          ),
        );
      }
    }, 40);

    if (!mapsLoadCalled) {
      mapsLoadCalled = true;
      try {
        window.kakao.maps.load(() => {
          /* 폴링이 Map 준비를 감지한다 */
        });
      } catch (error) {
        mapsLoadCalled = false;
        window.clearInterval(timer);
        reject(error instanceof Error ? error : new Error("카카오맵 SDK 로드 실패"));
      }
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

  if (mapsApiReady()) {
    return Promise.resolve(window.kakao.maps);
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
        if (typeof window.kakao?.maps?.load === "function") {
          onScriptReady();
          return;
        }
        if (existing.dataset.loaded === "1") {
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
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
      script.onload = () => {
        script.dataset.loaded = "1";
        onScriptReady();
      };
      script.onerror = () => fail("카카오맵 스크립트 로드 오류");
      document.head.appendChild(script);
    }),
    LOAD_TIMEOUT_MS,
    `카카오맵 로딩 시간 초과 (${typeof window !== "undefined" ? window.location.host : ""}). JavaScript 키·Web 도메인을 확인하세요.`,
  ).catch((error) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}
