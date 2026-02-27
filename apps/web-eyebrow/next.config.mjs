/** @type {import("next").NextConfig} */
const config = {
  // standalone output for Cloudflare Pages via @cloudflare/next-on-pages
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default config;
