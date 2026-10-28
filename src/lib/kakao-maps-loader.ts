/**
 * 카카오맵 JavaScript SDK 로더 (브라우저 전용).
 * NEXT_PUBLIC_KAKAO_MAP_KEY 만 사용 — REST 키는 여기서 읽지 않는다.
 *
 * autoload=false 일 때 kakao.maps.load() 콜백은 사실상 한 번만 온다.
 * 재호출하면 영원히 대기하므로, load는 프로세스당 1회만 호출하고
 * 이후에는 Map 생성자 준비 여부를 폴링한다.
 */

const SCRIPT_ID = "kakao-maps-sdk";
const LOAD_TIMEOUT_MS = 15_000;

let loadPromise: Promise<typeof kakao.maps> | null = null;
let mapsLoadStarted = false;

export function getKakaoMapAppKey(): string | null {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim();
  return key || null;
}

export function kakaoMapScriptUrl(): string | null {
  const key = getKakaoMapAppKey();
  if (!key) return null;
  return `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
}

function mapsApiReady(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.kakao?.maps?.Map === "function" &&
    typeof window.kakao.maps.LatLng === "function"
  );
}

function waitUntilMapsReady(): Promise<typeof kakao.maps> {
  if (mapsApiReady()) return Promise.resolve(window.kakao.maps);

  return new Promise((resolve, reject) => {
    const started = Date.now();

    const finishOk = () => {
      window.clearInterval(timer);
      resolve(window.kakao.maps);
    };
    const finishErr = (message: string) => {
      window.clearInterval(timer);
      reject(new Error(message));
    };

    const timer = window.setInterval(() => {
      if (mapsApiReady()) {
        finishOk();
        return;
      }
      if (Date.now() - started > LOAD_TIMEOUT_MS) {
        finishErr(
          "카카오맵 초기화 시간 초과. JavaScript 키와 카카오 디벨로퍼스 Web 도메인(Vercel 주소)을 확인하세요.",
        );
      }
    }, 40);

    if (!window.kakao?.maps?.load) {
      finishErr("카카오맵 SDK가 초기화되지 않았습니다. JavaScript 키·웹 도메인을 확인하세요.");
      return;
    }

    if (!mapsLoadStarted) {
      mapsLoadStarted = true;
      try {
        window.kakao.maps.load(() => {
          if (mapsApiReady()) finishOk();
        });
      } catch (error) {
        mapsLoadStarted = false;
        finishErr(error instanceof Error ? error.message : "카카오맵 SDK 로드 실패");
      }
    }
  });
}

function ensureScript(): Promise<void> {
  if (typeof window.kakao?.maps?.load === "function") {
    return Promise.resolve();
  }

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    if (typeof window.kakao?.maps?.load === "function") return Promise.resolve();
    if (existing.dataset.loaded === "1") {
      return Promise.reject(
        new Error("카카오맵 스크립트는 있으나 SDK 객체가 없습니다. JavaScript 키를 확인하세요."),
      );
    }
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

  const src = kakaoMapScriptUrl();
  if (!src) {
    return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 가 없습니다."));
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = src;
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

  if (!getKakaoMapAppKey()) {
    return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 가 없습니다."));
  }

  if (mapsApiReady()) {
    loadPromise ??= Promise.resolve(window.kakao.maps);
    return loadPromise;
  }

  if (loadPromise) return loadPromise;

  loadPromise = ensureScript()
    .then(() => waitUntilMapsReady())
    .catch((error) => {
      loadPromise = null;
      throw error;
    });

  return loadPromise;
}
