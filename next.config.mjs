/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` opens raw sockets and PGlite loads a WebAssembly build from its own
  // package directory, so neither survives being bundled.
  serverExternalPackages: ['pg', '@electric-sql/pglite'],
};

export default nextConfig;
