/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f1117",
          card: "#1a1d27",
          hover: "#242833",
          border: "#2e3345",
        },
        accent: {
          DEFAULT: "#3b82f6",
          hover: "#2563eb",
        },
      },
    },
  },
  plugins: [],
};
