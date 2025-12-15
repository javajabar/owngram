import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  // Ensure standard webpack is used in production (not Turbopack)
  webpack: (config, { isServer }) => {
    return config;
  },
};

export default nextConfig;
