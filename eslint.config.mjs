import obsidianmd from "eslint-plugin-obsidianmd";

// The directory reports TypeScript migration diagnostics as warnings. Keep
// them visible while enforcing every blocking Obsidian rule as recommended.
const typeWarnings = Object.fromEntries(obsidianmd.configs.recommended.flatMap(config =>
  Object.entries(config.rules ?? {}).filter(([rule, value]) => rule.startsWith("@typescript-eslint/")
    && ![0, "off"].includes(Array.isArray(value) ? value[0] : value))
    .map(([rule, value]) => [rule, Array.isArray(value) ? ["warn", ...value.slice(1)] : "warn"])));

export default [
  { ignores: ["main.js", "mcp/dist/**", "node_modules/**", "tools/**", "tests/**", "mcp/**", "scripts/**", "*.config.mjs", "esbuild.*"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: { parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname } },
    rules: { ...typeWarnings, "no-control-regex": "warn" },
  },
];
