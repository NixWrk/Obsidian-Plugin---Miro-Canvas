import { describe, expect, it, vi } from "vitest";
import { ToolArgumentsError, ToolRunner } from "../src/tool-runner";
import { ToolError } from "../src/vault";
import { McpServer } from "../src/json-rpc";
import type { ToolDefinition } from "../src/tools";

const operation: ToolDefinition = {
	name: "probe",
	title: "Probe",
	description: "Probe schema and error parity.",
	inputSchema: { type: "object", properties: { text: { type: "string", format: "future-format" } }, required: ["text"], additionalProperties: false },
	outputSchema: { type: "object" },
	run: args => ({ text: args.text }),
};

describe("shared schema-checked operations", () => {
	it("uses the same result and schema diagnostics in MCP and direct calls", async () => {
		const runner = new ToolRunner([operation]);
		const server = new McpServer({ name: "probe", version: "1", tools: [operation] });
		const args = { text: "keep" };
		const answer = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "probe", arguments: args } });
		expect(answer?.result).toEqual(runner.run("probe", args));
		expect(() => runner.run("probe", { text: 5 })).toThrow(ToolArgumentsError);
		const invalid = await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "probe", arguments: { text: 5 } } });
		expect(invalid?.error?.code).toBe(-32602);
		expect(invalid?.error?.message).toContain("/text must be string");
	});

	it("preserves refusals and thrown tool diagnostics", () => {
		const denied = { ...operation, run: () => ({ status: "rejected", reason: "locked" }), failed: () => true };
		expect(new ToolRunner([denied]).run("probe", { text: "x" })).toMatchObject({ isError: true, structuredContent: { status: "rejected" } });
		const missing = { ...operation, run: () => { throw new ToolError("not-found", "No board."); } };
		expect(new ToolRunner([missing]).run("probe", { text: "x" })).toEqual({ isError: true, content: [{ type: "text", text: "not-found: No board." }] });
	});

	it("keeps dependency warnings out of stdout without replacing console methods", () => {
		const methods = ["log", "info", "debug", "warn", "error"] as const;
		const original = methods.map(name => console[name]);
		const spies = methods.map(name => vi.spyOn(console, name).mockImplementation(() => {}));
		try {
			const runner = new ToolRunner([operation]);
			expect(runner.run("probe", { text: "x" }).isError).toBe(false);
			for (const spy of spies) expect(spy).not.toHaveBeenCalled();
		} finally {
			for (const spy of spies) spy.mockRestore();
		}
		expect(methods.map(name => console[name])).toEqual(original);
	});
});
