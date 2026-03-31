const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '..'),
  },

  async redirects() {
    return [
      { source: '/favicon.ico', destination: '/favicon.png', permanent: false },
      // Future landing page redirects for long-tail SEO pages (when built)
      // { source: '/gps-tracker-for-car-australia', destination: '/order', permanent: false },
    ];
  },

  async headers() {
    return [
      // Security + cache headers for all routes
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
      // Long-lived cache for static public assets
      {
        source: '/images/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Vary', value: 'Accept' },
        ],
      },
      // Moderate cache for favicon and public assets
      {
        source: '/:file(favicon\\.png|loading-logo\\.png|hero-kangaroo\\.webp|hero-kangaroo-mobile\\.webp|hero-kangaroo\\.png|theft-hero\\.png|bannerhero\\.png|LogoDark\\.png)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      // Short cache for dynamic marketing pages (allow CDN to cache briefly)
      {
        source: '/(|features|support|theft-stats)',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=3600' },
        ],
      },
    ];
  },

  images: {
    unoptimized: true,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
};

module.exports = nextConfig;
