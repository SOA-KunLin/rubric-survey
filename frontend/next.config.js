/** @type {import('next').NextConfig} */
// Optional reverse-proxy prefix, e.g. NEXT_PUBLIC_BASE_PATH=/diabetesqarubric just build
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

const nextConfig = {
  basePath,
  reactStrictMode: true,
  async rewrites() {
    // Same-origin proxy so browsers never need direct access to the backend port.
    // basePath is NOT auto-applied to rewrite sources in all versions, so compose explicitly.
    return [
      {
        source: '/backend-api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
