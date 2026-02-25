const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure server bundle can resolve next when built from monorepo subdir (fixes Netlify "Cannot find module next/dist/server/lib/start-server.js")
  outputFileTracingRoot: path.join(__dirname, '..'),
  async redirects() {
    return [{ source: '/favicon.ico', destination: '/favicon.png', permanent: false }];
  },
};

module.exports = nextConfig;
