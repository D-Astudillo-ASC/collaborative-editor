import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: [
            "node_modules/**",
            "dist/**",
            "build/**",
            "*.config.{js,ts,mjs}",
            "tailwind.config.*",
            "vite.config.*",
            "server/**", // Server code has its own ESLint config if needed
        ],
    },
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                ecmaFeatures: { jsx: true },
                ecmaVersion: "latest",
                sourceType: "module",
            },
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        plugins: {
            react: pluginReact,
            "react-hooks": pluginReactHooks,
            "react-refresh": reactRefresh,
        },
        settings: {
            react: {
                version: "detect",
            },
        },
        rules: {
            ...pluginJs.configs.recommended.rules,
            ...pluginReact.configs.recommended.rules,
            ...pluginReactHooks.configs.recommended.rules,
            "react/react-in-jsx-scope": "off", // Not needed in React 17+
            "react/jsx-uses-react": "off", // Not needed in React 17+
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            "no-unused-vars": "off", // Use TypeScript version instead
        },
    },
    eslintConfigPrettier, // Must be last to override other configs
];
