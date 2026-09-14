/** @type {import('next').NextConfig} */
/** Production: set API_PROXY_TARGET=https://api.retailsarathi.in (see apps/web/.env.example) */
const apiOrigin = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

const nextConfig = {
  transpilePackages: ['@retail-sarathi/ui', '@retail-sarathi/types'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiOrigin}/uploads/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
