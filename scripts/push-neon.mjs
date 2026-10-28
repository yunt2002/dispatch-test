import { spawnSync } from "node:child_process";
import fs from "node:fs";

const envText = fs.readFileSync(".env", "utf8");
const match = envText.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}
const url = match[1].trim().replace(/^["']|["']$/g, "");
if (!url.startsWith("postgres")) {
  console.error("DATABASE_URL must be postgresql:// ...");
  process.exit(1);
}

// Prisma + some drivers dislike channel_binding
const clean = url.replace(/&channel_binding=require/g, "").replace(/\?channel_binding=require&/g, "?");

process.env.DATABASE_URL = clean;
console.log("Using host:", clean.split("@")[1]?.split("/")[0] ?? "(hidden)");

for (const args of [
  ["npx", "prisma", "db", "push"],
  ["npx", "tsx", "prisma/seed.ts"],
]) {
  const result = spawnSync(args[0], args.slice(1), {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  if (result.status) process.exit(result.status ?? 1);
}

console.log("db push + seed OK");
