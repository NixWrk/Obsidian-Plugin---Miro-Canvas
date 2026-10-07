/** Schema-checked board operations shared by the MCP and command-line frontends. */
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import type { ToolDefinition } from "./tools";
import { ToolError } from "./vault";

export class ToolArgumentsError extends Error {}

export interface ToolResult {
	readonly content: readonly { readonly type: "text"; readonly text: string }[];
	readonly structuredContent?: Record<string, unknown>;
	readonly isError: boolean;
}

export class ToolRunner {
	private readonly tools = new Map<string, ToolDefinition>();
	private readonly argumentCheckers = new Map<string, ValidateFunction>();

	public constructor(tools: readonly ToolDefinition[]) {
		const ajv = new Ajv2020({ strict: false, allErrors: true, useDefaults: false, logger: false });
		for (const tool of tools) {
			this.tools.set(tool.name, tool);
			this.argumentCheckers.set(tool.name, ajv.compile(tool.inputSchema));
		}
	}

	public run(name: string, args: unknown = {}): ToolResult {
		const tool = this.tools.get(name);
		const checker = this.argumentCheckers.get(name);
		if (tool === undefined || checker === undefined) throw new ToolArgumentsError(`Unknown tool: ${name}`);
		if (args === null || typeof args !== "object" || Array.isArray(args) || !checker(args)) {
			const problems = (checker.errors ?? []).map(error => `${error.instancePath || "arguments"} ${error.message ?? "is invalid"}`);
			throw new ToolArgumentsError(`Invalid arguments for ${tool.name}: ${problems.join("; ") || "arguments must be an object"}`);
		}
		try {
			const structured = tool.run(args as Record<string, unknown>);
			return {
				content: [{ type: "text", text: JSON.stringify(structured) }],
				structuredContent: structured,
				isError: tool.failed?.(structured) === true,
			};
		} catch (error) {
			const code = error instanceof ToolError ? error.code : "internal";
			const message = error instanceof Error ? error.message : String(error);
			return { content: [{ type: "text", text: `${code}: ${message}` }], isError: true };
		}
	}
}
