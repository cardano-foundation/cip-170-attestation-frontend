/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  turbopack: {},

  webpack: (config, {isServer}) => {
    // Enable WebAssembly
    config.experiments = { 
      ...config.experiments, 
      asyncWebAssembly: true,
      layers: true 
    };

    // Fix for libsodium in browser
    if (!isServer) {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            crypto: false,
            path: false,
            fs: false,
            stream: false,
        };
    }
    
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    return config;
  },
};

module.exports = nextConfig;
