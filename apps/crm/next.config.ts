import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@transcribator/api-client', '@transcribator/shared', '@transcribator/ui']
};

export default nextConfig;
