import { PassThrough } from "node:stream";
import Ajv2020 from "ajv/dist/2020";
import { afterEach, describe, expect, it } from "vitest";

import { LATEST_PROTOCOL_VERSION, McpServer, serveLines } from "../src/json-rpc";
import { createReadTools } from "../src/tools";
import { Vault } from "../src/vault";
import { makeFixtureVault, removeVaults } from "./helpers";

afterEach(removeVaults);

function makeServer(): McpServer {
	const vault = Vault.open(makeFixtureVault());
	return new McpServer({ name: "miro-canvas", version: "test", tools: createReadTools({ vault }) });
}

/** Send lines to a server over a pair of streams, as stdio would, and collect every answer. */
async function exchange(server: McpServer, messages: readonly (string | Record<string, unknown>)[]): Promise<Record<string, any>[]> {
	const input = new PassThrough();
	const output = new PassThrough();
	const chunks: Buffer[] = [];
	output.on("data", (chunk: Buffer) => chunks.push(chunk));
	const served = serveLines(server, input, output);
	for (const message of messages) {
		input.write(`${typeof message === "string" ? message : JSON.stringify(message)}\n`);
	}
	input.end();
	await served;
	return Buffer.concat(chunks).toString("utf8").split("\n").filter((line) => line !== "").map((line) => JSON.parse(line));
}

function request(id: number, method: string, params?: unknown): Record<string, unknown> {
	return { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
}

describe("MCP over newline-delimited JSON-RPC", () => {
	it("speaks the client's protocol version when it knows it, else the newest", async () => {
		const answers = await exchange(makeServer(), [
			request(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } }),
			request(2, "initialize", { protocolVersion: "1999-01-01", capabilities: {}, clientInfo: { name: "test", version: "1" } }),
		]);
		expect(answers[0].result.protocolVersion).toBe("2025-03-26");
		expect(answers[0].result.serverInfo).toEqual({ name: "miro-canvas", version: "test" });
		expect(answers[0].result.capabilities).toEqual({ tools: { listChanged: false } });
		expect(answers[1].result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
	});

	it("answers requests in order and never a notification", async () => {
		const answers = await exchange(makeServer(), [
			{ jsonrpc: "2.0", method: "notifications/initialized" },
			request(1, "ping"),
			{ jsonrpc: "2.0", method: "no/such/notification" },
			request(2, "ping"),
		]);
		expect(answers).toEqual([
			{ jsonrpc: "2.0", id: 1, result: {} },
			{ jsonrpc: "2.0", id: 2, result: {} },
		]);
	});

	it("lists the three reading tools with input and output schemas", async () => {
		const [answer] = await exchange(makeServer(), [request(1, "tools/list")]);
		const tools = answer.result.tools as Record<string, any>[];
		expect(tools.map((tool) => tool.name)).toEqual(["list_boards", "read_board", "validate_board"]);
		for (const tool of tools) {
			expect(tool.inputSchema.type).toBe("object");
			expect(tool.outputSchema.type).toBe("object");
			expect(tool.annotations.readOnlyHint).toBe(true);
		}
	});

	it("gives the JSON-RPC error codes for broken requests", async () => {
		const answers = await exchange(makeServer(), [
			"{not json",
			request(1, "no/such/method"),
			request(2, "tools/call", { name: "no_such_tool", arguments: {} }),
			request(3, "tools/call", { name: "read_board", arguments: { path: 5 } }),
			request(4, "tools/call", { name: "read_board", arguments: { path: "boards/native-board.canvas", surprise: true } }),
			{ jsonrpc: "1.0", id: 5, method: "ping" },
			{ jsonrpc: "2.0", id: { nested: true }, method: "ping" },
		]);
		expect(answers.map((answer) => [answer.id, answer.error?.code])).toEqual([
			[null, -32700],
			[1, -32601],
			[2, -32602],
			[3, -32602],
			[4, -32602],
			[5, -32600],
			[null, -32600],
		]);
	});

	it("reports a tool's refusal as a failed call, not a protocol error", async () => {
		const [answer] = await exchange(makeServer(), [
			request(1, "tools/call", { name: "read_board", arguments: { path: "../outside.canvas" } }),
		]);
		expect(answer.error).toBeUndefined();
		expect(answer.result.isError).toBe(true);
		expect(answer.result.content[0].text).toMatch(/^path-invalid: /);
		expect(answer.result.structuredContent).toBeUndefined();
	});

	it("answers every tool with structured content its output schema accepts, and the same as text", async () => {
		const server = makeServer();
		const [list] = await exchange(server, [request(1, "tools/list")]);
		const schemas = new Map((list.result.tools as Record<string, any>[]).map((tool) => [tool.name, tool.outputSchema]));
		const ajv = new Ajv2020({ strict: false });
		const calls: [string, Record<string, unknown>][] = [
			["list_boards", {}],
			["read_board", { path: "boards/plugin-authored-board.canvas" }],
			["read_board", { path: "boards/plugin-authored-board.canvas", level: "items", limit: 2 }],
			["read_board", { path: "boards/plugin-authored-board.canvas", level: "full" }],
			["read_board", { path: "boards/converter-board.canvas", sourcePointer: "/items/0" }],
			["validate_board", { path: "boards/future-fields-board.canvas" }],
		];
		const answers = await exchange(server, calls.map(([name, args], index) => request(index + 1, "tools/call", { name, arguments: args })));
		answers.forEach((answer, index) => {
			const [name] = calls[index];
			expect(answer.result.isError).toBe(false);
			expect(JSON.parse(answer.result.content[0].text)).toEqual(answer.result.structuredContent);
			const valid = ajv.validate(schemas.get(name), answer.result.structuredContent);
			expect(valid, `${name}: ${JSON.stringify(ajv.errors)}`).toBe(true);
		});
	});
});
