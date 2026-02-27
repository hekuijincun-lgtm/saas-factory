import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brow: {
          bg:      "#fdf8f3",
          card:    "#fffbf7",
          border:  "#e8d5c4",
          primary: "#7c4f2a",
          hover:   "#6b4123",
          accent:  "#c4874a",
          text:    "#2c1810",
          muted:   "#8a6756",
          light:   "#f0e4d4",
          success: "#3d8a4e",
        },
      },
      fontFamily: {
        sans: [
          "Hiragino Kaku Gothic ProN",
          "Hiragino Sans",
          "BIZ UDPGothic",
          "Meiryo",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
