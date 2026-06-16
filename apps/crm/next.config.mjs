/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@transcribator/api-client', '@transcribator/shared', '@transcribator/ui']
};

export default nextConfig;
