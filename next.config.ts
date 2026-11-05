import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Build plain web pages into `out/` (DECISIONS 2026-11-05). Netlify serves them as
  // they are, with no server and no Next.js runtime needed. Every page today runs in
  // the browser. Revisit when the first server-side feature (database, sign-in) arrives.
  output: 'export',
  // Each page becomes a folder with an index.html (/rooms/preview/ → rooms/preview/index.html),
  // which every static host serves the same way.
  trailingSlash: true,
};

export default nextConfig;
