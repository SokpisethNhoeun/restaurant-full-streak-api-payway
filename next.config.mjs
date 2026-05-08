/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!backendUrl) {
      return [];
    }

    const target = backendUrl.replace(/\/$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`
      },
      {
        source: "/actuator/:path*",
        destination: `${target}/actuator/:path*`
      },
      {
        source: "/ws/:path*",
        destination: `${target}/ws/:path*`
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate"
          },
          {
            key: "Service-Worker-Allowed",
            value: "/"
          }
        ]
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json"
          },
          {
            key: "Cache-Control",
            value: "public, max-age=3600"
          }
        ]
      },
      {
        source: "/offline.html",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
