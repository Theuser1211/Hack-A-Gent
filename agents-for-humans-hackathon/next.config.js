/** @type {import('next').NextConfig} */
const nextConfig = {
  // The generated project declares no linter of its own (package.json's lint
  // script is a no-op), so ESLint invoked by `next build` resolves its config
  // from the parent directory and unrelated rules decide whether the build
  // succeeds. Type checking stays a hard gate.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

module.exports = nextConfig;
