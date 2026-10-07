import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "node:url";

const forbiddenModules = new Set([
	"obsidian", "electron", "http", "https", "net", "tls", "dgram", "http2", "dns",
	"child_process", "axios", "superagent", "got", "ofetch", "ky", "node-fetch",
	"cross-fetch", "undici", "ws",
]);

const runtime = {
	rules: {
		"stdio": {
			meta: { type: "problem", schema: [], messages: {
				console: "Standalone board tools cannot use console; return diagnostics or write startup errors to stderr.",
				stdout: "Stdout is reserved for MCP serveLines and the CLI final JSON response.",
			} },
			create(context) {
				return {
					MemberExpression(node) {
						if (node.object.type !== "Identifier" || node.object.name !== "process") return;
						const property = node.computed ? node.property.value : node.property.name;
						if (property !== "stdout") return;
						const call = node.parent;
						if (context.filename.replaceAll("\\", "/").endsWith("/mcp/src/server.ts")
							&& call.type === "CallExpression" && call.callee.type === "Identifier"
							&& call.callee.name === "serveLines" && call.arguments[2] === node) return;
						if (context.filename.replaceAll("\\", "/").endsWith("/mcp/src/cli.ts")
							&& call.type === "MemberExpression" && !call.computed && call.property.name === "write"
							&& call.parent.type === "CallExpression" && call.parent.callee === call
							&& call.parent.parent.type === "ExpressionStatement" && call.parent.parent.parent.type === "Program") return;
						context.report({ node, messageId: "stdout" });
					},
					Identifier(node) {
						if (node.name !== "console") return;
						context.report({ node, messageId: "console" });
					},
				};
			},
		},
		"modules": {
			meta: { type: "problem", schema: [], messages: { module: "The stdio server cannot import {{name}}.", dynamic: "The stdio server requires a literal module name." } },
			create(context) {
				const check = (node) => {
					if (!node) return;
					if (node.type !== "Literal" || typeof node.value !== "string") {
						context.report({ node, messageId: "dynamic" });
						return;
					}
					const name = node.value.replace(/^node:/, "").split("/")[0];
					if (forbiddenModules.has(name)) context.report({ node, messageId: "module", data: { name: node.value } });
				};
				return {
					ImportDeclaration: (node) => check(node.source),
					ExportNamedDeclaration: (node) => check(node.source),
					ExportAllDeclaration: (node) => check(node.source),
					ImportExpression: (node) => check(node.source),
					CallExpression(node) {
						if (node.callee.type === "Identifier" && node.callee.name === "require") check(node.arguments[0]);
					},
				};
			},
		},
		"config-path": {
			meta: { type: "problem", schema: [], messages: { path: "Use the active standalone Vault.configDir; only its explicit default may name .obsidian." } },
			create(context) {
				return {
					Literal(node) {
						if (node.value !== ".obsidian") return;
						const declaration = node.parent;
						if (context.filename.replaceAll("\\", "/").endsWith("/mcp/src/vault.ts")
							&& declaration.type === "VariableDeclarator" && declaration.init === node
							&& declaration.id.type === "Identifier" && declaration.id.name === "DEFAULT_CONFIG_DIR") return;
						context.report({ node, messageId: "path" });
					},
				};
			},
		},
	},
};

// This config describes the separately launched Node program, never src/ or the plugin.
export default [
	{ ignores: ["mcp/dist/**", "mcp/tests/**"] },
	...[js.configs.recommended, ...tseslint.configs.recommendedTypeChecked].map(config => ({ ...config, files: ["mcp/src/**/*.ts"] })),
	{
		files: ["mcp/src/**/*.ts"],
		languageOptions: {
			globals: globals.node,
			parserOptions: { project: "./tsconfig.json", tsconfigRootDir: fileURLToPath(new URL("..", import.meta.url)) },
		},
		plugins: { "mcp-runtime": runtime },
		rules: {
			"@typescript-eslint/no-unused-vars": ["error", { args: "all", argsIgnorePattern: "^_", ignoreRestSiblings: true }],
			"no-eval": "error",
			"no-new-func": "error",
			"no-control-regex": "error",
			"no-restricted-globals": ["error", "fetch", "WebSocket", "EventSource"],
			"no-restricted-properties": ["error", { object: "globalThis", property: "fetch" }, { object: "globalThis", property: "WebSocket" }, { object: "globalThis", property: "EventSource" }],
			"mcp-runtime/stdio": "error",
			"mcp-runtime/modules": "error",
			"mcp-runtime/config-path": "error",
		},
	},
];
