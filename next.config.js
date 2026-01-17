/** @type {import('next').NextConfig} */

const nextConfig = {
    webpack: (config, { isServer }) => {
        // Handle face-api.js and tracking.js browser-only modules
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                path: false,
            };
        }
        return config;
    },
};

module.exports = nextConfig;
