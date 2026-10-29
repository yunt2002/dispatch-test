/**
 * 카카오맵 JavaScript SDK 로더 (브라우저 전용).
 * NEXT_PUBLIC_KAKAO_MAP_KEY 만 사용 — REST 키는 여기서 읽지 않는다.
 */

const SCRIPT_ID = "kakao-maps-sdk";
const LOAD_TIMEOUT_MS = 30_000;

let loadPromise: Promise<typeof kakao.maps> | null = null;

export function getKakaoMapAppKey(): string | null {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim();
  return key || null;
}

function mapsApiReady(): boolean {
  return typeof window.kakao?.maps?.Map === "function";
}

function domainHint(): string {
  const host = typeof window !== "undefined" ? window.location.host : "";
  if (!host) return "카카오 디벨로퍼스 Web 사이트 도메인을 확인하세요.";
  if (host.endsWith(".vercel.app") && host !== "dispatch-test1.vercel.app") {
    return `지금 주소(${host})는 배포 임시 URL입니다. 가능하면 https://dispatch-test1.vercel.app 로 접속하거나, 카카오 Web 도메인에 이 호스트를 추가하세요.`;
  }
  return `카카오 Web 도메인에 ${host} 등록 여부를 확인하세요.`;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function injectSdkScript(appKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (typeof window.kakao?.maps?.load === "function" || existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`카카오맵 스크립트 로드 오류. ${domainHint()}`)),
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
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`카카오맵 스크립트 로드 오류. ${domainHint()}`));
    };
    document.head.appendChild(script);
  });
}

function waitForKakaoMaps(timeoutMs: number): Promise<typeof kakao.maps> {
  if (mapsApiReady()) return Promise.resolve(window.kakao.maps);

  return new Promise((resolve, reject) => {
    if (typeof window.kakao?.maps?.load !== "function") {
      reject(new Error(`카카오맵 SDK가 초기화되지 않았습니다. ${domainHint()}`));
      return;
    }

    let settled = false;
    const finish = (maps: typeof kakao.maps) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timer);
      resolve(maps);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timer);
      reject(error);
    };

    const poll = window.setInterval(() => {
      if (mapsApiReady()) finish(window.kakao.maps);
    }, 50);

    const timer = window.setTimeout(() => {
      fail(
        new Error(`카카오맵 초기화 시간 초과 (${window.location.host}). ${domainHint()}`),
      );
    }, timeoutMs);

    try {
      window.kakao.maps.load(() => {
        if (mapsApiReady()) finish(window.kakao.maps);
      });
    } catch (error) {
      fail(error instanceof Error ? error : new Error("카카오맵 SDK 로드 실패"));
    }
  });
}

async function loadSdkOnce(appKey: string): Promise<typeof kakao.maps> {
  await injectSdkScript(appKey);
  return waitForKakaoMaps(18_000);
}

/** 실패한 뒤 다시 불러올 수 있게 모듈 상태를 비운다. */
export function resetKakaoMapsLoader(): void {
  loadPromise = null;
}

export function loadKakaoMaps(): Promise<typeof kakao.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Kakao Maps SDK는 클라이언트에서만 로드됩니다."));
  }

  const appKey = getKakaoMapAppKey();
  if (!appKey) {
    return Promise.reject(
      new Error(
        "NEXT_PUBLIC_KAKAO_MAP_KEY 가 없습니다. Vercel Environment Variables에 넣은 뒤 Redeploy 하세요.",
      ),
    );
  }

  if (mapsApiReady()) {
    return Promise.resolve(window.kakao.maps);
  }
  if (loadPromise) return loadPromise;

  loadPromise = withTimeout(
    (async () => {
      try {
        return await loadSdkOnce(appKey);
      } catch (firstError) {
        await sleep(600);
        try {
          return await loadSdkOnce(appKey);
        } catch {
          throw firstError;
        }
      }
    })(),
    LOAD_TIMEOUT_MS,
    `카카오맵 로딩 시간 초과 (${window.location.host}). ${domainHint()}`,
  ).catch((error) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}
