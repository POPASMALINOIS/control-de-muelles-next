// next.config.ts
import path from 'path';
import { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Si quieres export estático (reemplaza el antiguo `next export`)
  output: 'export',

  // Ajustes de Webpack para resolver el alias '@' -> root del proyecto
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // '@' en imports apuntará al root del repo (donde package.json está)
      '@': path.resolve(__dirname),
    };
    return config;
  },
};

export default nextConfig;
