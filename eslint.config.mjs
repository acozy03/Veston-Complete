// eslint.config.js
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.js"],
    rules: {
      semi: "off", // <-- don't report missing semicolons
    },
  },

  {
    files: ["**/*.js"],
    ignores: ["__tests/**"],
    rules: {
      "no-console": "error",
    },
  },
]);
