/** @type {import('next').NextConfig} */
const nextConfig = {
   devIndicators: false,
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    domains: [
      'lh3.googleusercontent.com',
      'lh4.googleusercontent.com',
      'lh5.googleusercontent.com',
      'lh6.googleusercontent.com',
      'avatars.githubusercontent.com',
      'gravatar.com',
      'secure.gravatar.com',
      's.gravatar.com',
      'pbs.twimg.com',
    ],
  },
 
}

export default nextConfig
