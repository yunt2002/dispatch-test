import { spawnSync } from "node:child_process";

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

const steps = [
  ["npx", "prisma", "generate"],
  ["npx", "prisma", "db", "push"],
  ["npx", "prisma", "db", "seed"],
  ["npx", "next", "build"],
];

for (const [command, ...args] of steps) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  if (result.status) {
    process.exit(result.status ?? 1);
  }
}
