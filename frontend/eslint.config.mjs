import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Existing code types caught errors and request payloads as `any`
      // (e.g. `onError: (err: any)`); tightening that is a separate cleanup.
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
