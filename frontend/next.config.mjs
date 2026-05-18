/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL 
      ? new URL(process.env.NEXT_PUBLIC_API_URL).origin 
      : "http://localhost:8000";

    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "0",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // unsafe-inline is required for Next.js hydration scripts and styled-jsx.
              // unsafe-eval is enabled ONLY in development for Webpack HMR and code compilation.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: blob: ${apiOrigin}`,
              "font-src 'self'",
              `connect-src 'self' ${apiOrigin} https://*.gymflowtrack.in`,
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  async rewrites() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL 
      ? new URL(process.env.NEXT_PUBLIC_API_URL).origin 
      : "http://localhost:8000";
    
    const destinationHost = process.env.BACKEND_INTERNAL_URL || apiOrigin;

    return [
      {
        source: "/api/v1/:path*",
        destination: `${destinationHost}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
