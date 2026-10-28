import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

/** Vercel은 런타임 쓰기가 /tmp만 가능. 빌드된 sqlite를 복사해 사용한다. */
function ensureDatabaseUrl() {
  if (process.env.VERCEL) {
    const tmpDb = "/tmp/dispatch.db";
    const bundledDb = join(process.cwd(), "prisma", "dev.db");
    if (!existsSync(tmpDb) && existsSync(bundledDb)) {
      copyFileSync(bundledDb, tmpDb);
    }
    process.env.DATABASE_URL = `file:${tmpDb}`;
    return;
  }

  process.env.DATABASE_URL ??= "file:./dev.db";
}

ensureDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
