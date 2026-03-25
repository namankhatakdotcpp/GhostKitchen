import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#FF5200",
        "brand-dark": "#E84800",
        "brand-light": "#FFF1EB",
        surface: "#F5F5F5",
        card: "#FFFFFF",
        border: "#E8E8E8",
        "text-primary": "#1C1C1C",
        "text-secondary": "#686B78",
        "text-muted": "#93959F",
        success: "#1BA672",
        warning: "#F4A000",
        danger: "#DB3A3A",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        pill: "999px",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        focus: "0 0 0 2px #FF520030",
      },
      maxWidth: {
        shell: "1280px",
      },
    },
  },
  plugins: [],
};

export default config;
