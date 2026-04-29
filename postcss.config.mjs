/** @type {import("postcss-load-config").Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {
      future: {
        hoverOnlyWhenSupported: false, // This ensures hover works on mobile too
      },
    },
  },
};

export default config;
