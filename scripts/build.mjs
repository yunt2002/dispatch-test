import { spawnSync } from "node:child_process";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error(
    "[build] DATABASE_URL 이 없습니다. Neon Postgres URL을 Vercel env / .env 에 설정하세요.",
  );
  process.exit(1);
}
if (databaseUrl.startsWith("file:")) {
  console.error(
    "[build] SQLite(file:) 는 Vercel에서 사용할 수 없습니다. postgresql:// ... URL을 넣으세요.",
  );
  process.exit(1);
}

/** Vercel이 넣는 pnpm용 cache-dir 은 npm 11에서 경고만 냄 → 자식 프로세스에서 제거 */
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    const lower = key.toLowerCase();
    if (
      lower === "npm_config_cache_dir" ||
      lower === "npm_config_cache-dir" ||
      lower.startsWith("npm_config_cache_dir")
    ) {
      delete env[key];
    }
  }
  return env;
}

function runBin(binName, args) {
  const isWin = process.platform === "win32";
  const binPath = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    isWin ? `${binName}.cmd` : binName,
  );
  const result = spawnSync(binPath, args, {
    stdio: "inherit",
    env: cleanEnv(),
    // Windows .cmd 만 shell 필요. Linux(Vercel)는 shell 끄면 DEP0190 경고도 사라짐.
    shell: isWin,
  });
  if (result.status) {
    process.exit(result.status ?? 1);
  }
}

// seed 는 배포마다 돌리면 마스터를 지우고 빌드·첫 요청이 느려집니다.
// 최초 1회만: npx tsx prisma/seed.ts
runBin("prisma", ["generate"]);
runBin("prisma", ["db", "push"]);
runBin("next", ["build"]);
