const minioBucket = process.env.MINIO_BUCKET || "happyboat-menu-images";

const configuredMinioPattern = imageRemotePatternFromUrl(
  process.env.MINIO_PUBLIC_URL || process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL
);

const imageRemotePatterns = uniqueRemotePatterns([
  {
    protocol: "http",
    hostname: "18.138.186.66",
    port: "9000",
    pathname: `/${minioBucket}/**`
  },
  {
    protocol: "http",
    hostname: "localhost",
    port: "9000",
    pathname: `/${minioBucket}/**`
  },
  {
    protocol: "http",
    hostname: "127.0.0.1",
    port: "9000",
    pathname: `/${minioBucket}/**`
  },
  {
    protocol: "http",
    hostname: "minio",
    port: "9000",
    pathname: `/${minioBucket}/**`
  },
  {
    protocol: "https",
    hostname: "images.unsplash.com",
    pathname: "/**"
  },
  configuredMinioPattern
]);

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: imageRemotePatterns
  },
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

function imageRemotePatternFromUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/$/, "") || `/${minioBucket}`;
    return {
      protocol: url.protocol.replace(":", ""),
      hostname: url.hostname,
      port: url.port,
      pathname: `${pathname}/**`
    };
  } catch {
    return null;
  }
}

function uniqueRemotePatterns(patterns) {
  const seen = new Set();
  return patterns.filter((pattern) => {
    if (!pattern) return false;
    const key = `${pattern.protocol}:${pattern.hostname}:${pattern.port || ""}:${pattern.pathname || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
