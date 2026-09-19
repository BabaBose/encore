/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module: it must stay external so its .node
  // binary is traced into the deployment rather than bundled.
  serverExternalPackages: ['better-sqlite3'],

  // Files the server reads at runtime that nothing imports, so tracing cannot
  // find them on its own: the schema, and the seeded database a serverless
  // instance copies into /tmp on cold start.
  outputFileTracingIncludes: {
    '/**': ['./src/db/schema.sql', './data/booktheact.db'],
  },
};

export default nextConfig;
