import type { NextConfig } from "next";

// Sent with every page and API response
const securityHeaders = [
  // Only ever open the site over HTTPS (one year)
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // Don't let browsers guess file types
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't let other sites show the page in a frame (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Other sites see only "rff.fvcloud.eu", not the search in the address
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The site doesn't use the camera, microphone or location
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Don't advertise the framework ("X-Powered-By: Next.js")
  poweredByHeader: false,
  // Shown by /api/health, to tell which version is live (GitHub Actions sets GITHUB_SHA)
  env: {
    BUILD_SHA: (process.env.GITHUB_SHA ?? 'local').slice(0, 7),
    BUILD_TIME: new Date().toISOString(),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
