/**
 * The Model Context Protocol over stdio: JSON-RPC 2.0, one message per line.
 *
 * Written by hand rather than with the MCP SDK, which brings a web server
 * and a dozen packages along; the server needs five methods.  Requests are
 * answered one after another in the order they came, so two calls never
 * work on one board at once.  Notifications get no answer.
 */

import { createInterface, type ReadLineOptions } from "node:readline";

import type { ToolDefinition } from "./tools";
import { ToolArgumentsError, ToolRunner } from "./tool-runner";

/** Protocol versions this server speaks, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

type RequestId = string | number;

export interface JsonRpcResponse {
	readonly jsonrpc: "2.0";
	readonly id: RequestId | null;
	readonly result?: unknown;
	readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

export interface McpServerOptions {
	readonly name: string;
	readonly version: string;
	readonly tools: readonly ToolDefinition[];
	/** What the agent is told about the server when it connects. */
	readonly instructions?: string;
}

/** A protocol error: the request itself was wrong, not the tool's work. */
class RpcError extends Error {
	public readonly code: number;
	public readonly data?: unknown;

	public constructor(code: number, message: string, data?: unknown) {
		super(message);
		this.code = code;
		this.data = data;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRequestId(value: unknown): value is RequestId {
	return typeof value === "string" || (typeof value === "number" && Number.isInteger(value));
}

export class McpServer {
	private readonly options: McpServerOptions;
	private readonly runner: ToolRunner;

	public constructor(options: McpServerOptions) {
		this.options = options;
		this.runner = new ToolRunner(options.tools);
	}

	/**
	 * Answer one line of input: a response line, or undefined for a
	 * notification.  Never throws; whatever goes wrong becomes an error reply.
	 */
	public async handleLine(line: string): Promise<string | undefined> {
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch {
			return JSON.stringify(this.errorResponse(null, new RpcError(PARSE_ERROR, "Parse error: the line is not JSON.")));
		}
		const response = await this.handleMessage(message);
		return response === undefined ? undefined : JSON.stringify(response);
	}

	/** Answer one parsed message; undefined for a notification. */
	public async handleMessage(message: unknown): Promise<JsonRpcResponse | undefined> {
		if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
			// A response from the client, or something that is no message at all.
			if (isRecord(message) && message.jsonrpc === "2.0" && message.method === undefined && ("result" in message || "error" in message)) {
				return undefined;
			}
			const id = isRecord(message) && isRequestId(message.id) ? message.id : null;
			return this.errorResponse(id, new RpcError(INVALID_REQUEST, "Invalid request: not a JSON-RPC 2.0 message."));
		}
		const isNotification = !("id" in message);
		if (!isNotification && !isRequestId(message.id)) {
			return this.errorResponse(null, new RpcError(INVALID_REQUEST, "Invalid request: the id must be a string or an integer."));
		}
		try {
			const result = await this.dispatch(message.method, message.params);
			if (isNotification) return undefined;
			return { jsonrpc: "2.0", id: message.id as RequestId, result };
		} catch (error) {
			if (isNotification) return undefined;
			return this.errorResponse(message.id as RequestId, error);
		}
	}

	private errorResponse(id: RequestId | null, error: unknown): JsonRpcResponse {
		if (error instanceof RpcError) {
			return { jsonrpc: "2.0", id, error: { code: error.code, message: error.message, ...(error.data === undefined ? {} : { data: error.data }) } };
		}
		const detail = error instanceof Error ? error.message : String(error);
		return { jsonrpc: "2.0", id, error: { code: INTERNAL_ERROR, message: `Internal error: ${detail}` } };
	}

	private dispatch(method: string, params: unknown): Promise<unknown> {
		return new Promise<unknown>((resolve) => {
			switch (method) {
				case "initialize":
					resolve(this.initialize(params));
					return;
				case "notifications/initialized":
				case "notifications/cancelled":
					resolve({});
					return;
				case "ping":
					resolve({});
					return;
				case "tools/list":
					resolve(this.listTools());
					return;
				case "tools/call":
					resolve(this.callTool(params));
					return;
				default:
					throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`);
			}
		});
	}

	/** Speak the client's protocol version when this server knows it, else the newest. */
	private initialize(params: unknown): unknown {
		const requested = isRecord(params) ? params.protocolVersion : undefined;
		const known = (SUPPORTED_PROTOCOL_VERSIONS as readonly unknown[]).includes(requested);
		return {
			protocolVersion: known ? requested : LATEST_PROTOCOL_VERSION,
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: this.options.name, version: this.options.version },
			...(this.options.instructions === undefined ? {} : { instructions: this.options.instructions }),
		};
	}

	private listTools(): unknown {
		return {
			tools: this.options.tools.map((tool) => ({
				name: tool.name,
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
				outputSchema: tool.outputSchema,
				...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
			})),
		};
	}

	/**
	 * Run a tool.  A tool that is not there or arguments its schema refuses are
	 * protocol errors; a refusal from the tool itself is a result with isError.
	 */
	private callTool(params: unknown): unknown {
		if (!isRecord(params) || typeof params.name !== "string") {
			throw new RpcError(INVALID_PARAMS, "tools/call needs a tool name.");
		}
		try {
			return this.runner.run(params.name, params.arguments === undefined ? {} : params.arguments);
		} catch (error) {
			if (error instanceof ToolArgumentsError) throw new RpcError(INVALID_PARAMS, error.message);
			throw error;
		}
	}
}

/**
 * Serve one client on a pair of streams, line by line, one request at a time.
 * Resolves when the input ends and every answer is written.
 */
export async function serveLines(server: McpServer, input: ReadLineOptions["input"], output: { write(line: string): unknown }): Promise<void> {
	const lines = createInterface({ input, crlfDelay: Infinity });
	for await (const line of lines) {
		if (line.trim() === "") continue;
		const answer = await server.handleLine(line);
		if (answer !== undefined) output.write(`${answer}\n`);
	}
}
