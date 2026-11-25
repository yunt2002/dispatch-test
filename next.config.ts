import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: 4_200_000 } },
  serverExternalPackages: ["@prisma/client", "prisma", "exceljs"],
  allowedDevOrigins: ["192.168.0.87"],
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.prisma/client/**",
      "./prisma/dev.db",
      "./prisma/schema.prisma",
    ],
  },
};

export default nextConfig;
