/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.onrender.com",
      },
      {
        protocol: "https",
        hostname: "**.vercel.app",
      },
    ],
    // Fallback for missing or broken images
    unoptimized: false,
  },
};

export default nextConfig;
