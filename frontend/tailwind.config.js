/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      colors: {
        canvas: "#F5F6F8",
        surface: "#FFFFFF",
        line: { DEFAULT: "#E4E7EC", soft: "#F0F2F5" },
        ink: { DEFAULT: "#101828", 2: "#344054" },
        muted: "#5B6474",
        accent: { DEFAULT: "#3451D1", hover: "#2A43B0", soft: "#EEF1FB" },
        saved: { DEFAULT: "#0E7A6B", soft: "#E3F4F1" },
        spend: { DEFAULT: "#C2410C", soft: "#FDEDE4" },
        invest: { DEFAULT: "#6741D9", soft: "#EEE9FC" },
        warn: { DEFAULT: "#B45309", soft: "#FCF1E3" },
      },
      boxShadow: {
        lift: "0 8px 24px rgba(16, 24, 40, 0.08)",
        sheet: "-12px 0 40px rgba(16, 24, 40, 0.12)",
        pop: "0 1px 3px rgba(16, 24, 40, 0.12)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        slidein: { from: { opacity: "0", transform: "translateX(40px)" }, to: { opacity: "1", transform: "none" } },
        pop: { from: { opacity: "0", transform: "scale(0.97)" }, to: { opacity: "1", transform: "none" } },
        fadein: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        rise: "rise 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
        slidein: "slidein 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
        pop: "pop 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
        fadein: "fadein 0.2s ease",
      },
    },
  },
  plugins: [],
};
