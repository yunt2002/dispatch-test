import { spawnSync } from "node:child_process";

process.env.DATABASE_URL ??= "file:./dev.db";

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
