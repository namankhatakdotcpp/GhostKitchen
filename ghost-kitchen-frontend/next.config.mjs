/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel Analytics & Web Vitals
  // Enable in Vercel dashboard to see real user performance metrics
  productionBrowserSourceMaps: false, // Disable in production for faster builds
  
  images: {
    // For newer Next.js versions (using remotePatterns)
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
      {
        protocol: "https",
        hostname: "cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "**.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "**.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "**.s3.*.amazonaws.com",
      },
    ],
    // For backward compatibility with older Next.js
    domains: [
      "images.unsplash.com",
      "cloudinary.com",
      "s3.amazonaws.com",
      "localhost",
    ],
    unoptimized: false,
  },
};

export default nextConfig;
