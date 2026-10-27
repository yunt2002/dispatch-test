import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma", "exceljs"],
  allowedDevOrigins: ["192.168.0.87"],
  // Prisma client is generated into src/generated/prisma
};

export default nextConfig;
