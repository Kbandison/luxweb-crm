import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the Agreement markdown (and any other src/content files) with
  // every route's serverless bundle. The proposal-accept endpoint reads
  // this at runtime via fs.readFile to render a contract; without this
  // include, the file is missing from /var/task on Vercel and contract
  // auto-generation fails silently.
  outputFileTracingIncludes: {
    '/*': ['./src/content/**/*'],
  },
};

export default nextConfig;
