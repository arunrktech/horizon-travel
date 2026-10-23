/** @type {import('tailwindcss').Config} */
// Earth palette: charcoal "navy" for text and dark surfaces, bone and ochre "sand"
// for backgrounds and accents. Token names kept so components stay readable.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 50: "#F3EEE6", 100: "#E6DFD3", 300: "#A99C88", 500: "#6B5E4B", 700: "#3D372F", 800: "#2B2620", 900: "#1C1915" },
        sand: { 50: "#F8F5EF", 100: "#EFE7D9", 200: "#E3D5BC", 300: "#CDB58C", 500: "#A8844F", 700: "#7A5C33" },
        olive: { 500: "#6B6F4E", 700: "#4C5037" },
        ink: { DEFAULT: "#2B2620", muted: "#6E665B", faint: "#9C9386" },
        line: "#E2DACD",
        ok: "#4C6B3C",
        warn: "#9A6413",
        bad: "#A3372C",
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ['"Jost"', "system-ui", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(43,38,32,.05), 0 6px 24px rgba(43,38,32,.06)" },
      letterSpacing: { label: "0.18em" },
    },
  },
  plugins: [],
};
