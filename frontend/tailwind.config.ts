import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#040A13",
          900: "#07111F", // Primary background
          850: "#0C182B", // Card surface
          800: "#0F223D", // Elevated surface / card hover
          750: "#142B4E", // Intermediate border/surface
          700: "#1A335A", // Borders
          600: "#25487D",
        },
        cyan: {
          neon: "#00D1FF", // Neon cyan accent
          dim: "#0099BF",
          glow: "rgba(0, 209, 255, 0.25)",
        },
        purple: {
          brand: "#7B61FF", // Brand purple
          dim: "#6347EB",
          glow: "rgba(123, 97, 255, 0.25)",
        },
      },
      boxShadow: {
        glow: "0 0 25px -5px rgba(0, 209, 255, 0.3)",
        purpleGlow: "0 0 25px -5px rgba(123, 97, 255, 0.3)",
        card: "0 10px 30px -10px rgba(4, 10, 19, 0.8)",
      },
      animation: {
        pulseGlow: "pulseGlow 2.5s infinite ease-in-out",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
