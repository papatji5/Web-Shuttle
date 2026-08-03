import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.autotrader.co.za",
      },
    ],
  },
};

export default nextConfig;