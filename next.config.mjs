// next.config.mjs
// ⚠️ Cambia el valor de REPO_NAME por el nombre EXACTO de tu repositorio de GitHub.
const REPO_NAME = 'control-de-muelles-next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  output: 'export',
  // Para Project Pages: https://USUARIO.github.io/REPO_NAME/
  basePath: process.env.NODE_ENV === 'production' ? `/${REPO_NAME}` : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? `/${REPO_NAME}/` : '',
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
