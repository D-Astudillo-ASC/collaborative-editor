import type { Config } from "tailwindcss";

/**
 * Tailwind CSS v4 Configuration
 * 
 * In v4, theme customization is done via @theme directive in CSS (see src/styles/index.css)
 * This config file is minimal and only handles:
 * - Content paths (where Tailwind should look for classes)
 * - Plugins
 * - Other non-theme configuration
 */
export default {
    content: [
        "./pages/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
        "./app/**/*.{ts,tsx}",
        "./src/**/*.{ts,tsx}",
    ],
    // Note: darkMode, theme, and other customizations are now in CSS via @theme directive
    plugins: [require("tailwindcss-animate")],
} satisfies Config;
