import { defineConfig } from "vitest/config";

// Only this checkout's own tests: agents' worktrees under .claude/ carry
// their own copies, which must not run twice or against the wrong sources.
export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts", "mcp/tests/**/*.test.ts"],
		exclude: ["**/node_modules/**", ".claude/**"],
	},
});
