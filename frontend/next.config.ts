import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "books.google.com" },
      { hostname: "covers.openlibrary.org" },
      { hostname: "assets.hardcover.app" },
    ],
  },
};

export default nextConfig;
