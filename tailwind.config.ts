import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF6EE",
        navy: "#2D3B5E",
        gold: "#D9A947",
        sage: "#EDF3E7",
        pine: "#1E4630",
        clay: "#B4552E",
      },
      fontFamily: {
        sans: [
          "var(--font-dm)",
          "Segoe UI",
          "Tahoma",
          "\"Nirmala UI\"",
          "\"Microsoft YaHei\"",
          "\"PingFang SC\"",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
