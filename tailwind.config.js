/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "ui-sans-serif", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular"]
      },
      boxShadow: {
        soft: "0 20px 45px -20px rgba(0, 0, 0, 0.7)"
      }
    }
  },
  plugins: []
};
