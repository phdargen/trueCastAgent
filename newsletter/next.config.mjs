/** @type {import('next').NextConfig} */
const nextConfig = {
    // Silence warnings
    // https://github.com/WalletConnect/walletconnect-monorepo/issues/1908
    webpack: (config) => {
      config.externals.push('pino-pretty', 'lokijs', 'encoding');
      return config;
    },
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: '*.public.blob.vercel-storage.com',
          port: '',
          pathname: '/**',
        },
      ],
    },
  };
  
  export default nextConfig;
  