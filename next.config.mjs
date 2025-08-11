/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // experimental: {
  //   esmExternals: true,
  // },
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: '/api/auth/:path*',
      },
    ];
  },
};

export default nextConfig;
