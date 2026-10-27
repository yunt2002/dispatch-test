import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma", "exceljs"],
  allowedDevOrigins: ["192.168.0.87"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/client/**"],
  },
};

export default nextConfig;
