import { spawnSync } from "node:child_process";
import path from "node:path";

process.env.DATABASE_URL ??= "file:./dev.db";

const env = { ...process.env };
for (const key of Object.keys(env)) {
  const lower = key.toLowerCase();
  if (lower === "npm_config_cache_dir" || lower === "npm_config_cache-dir") {
    delete env[key];
  }
}

const isWin = process.platform === "win32";
const binPath = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  isWin ? "prisma.cmd" : "prisma",
);

const result = spawnSync(binPath, ["generate"], {
  stdio: "inherit",
  env,
  shell: isWin,
});

process.exit(result.status ?? 1);
