/** One-shot board operations; the plugin never imports or starts this program. */
import { readFileSync, statSync } from "node:fs";
import packageJson from "../../package.json";
import { createServerTools } from "./tools-edit";
import { ToolArgumentsError, ToolRunner, type ToolResult } from "./tool-runner";
import { DEFAULT_CONFIG_DIR, ToolError, Vault } from "./vault";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_CALLS = 1000;
const USAGE = `Miro Canvas CLI ${packageJson.version} (Node 20+)
  --vault <absolute path> [--config-dir <relative folder>] [--read-only] list
  --vault <absolute path> [options] call <tool> [--args <JSON> | --input <file> | --stdin]
  --vault <absolute path> [options] batch (--input <file> | --stdin)
Batch input: [{"name":"read_board","arguments":{"path":"board.canvas"}}, ...]
Use expectedRevision:"previous" for the last successful revision of the same board in a batch.
Batch stops on first failure; earlier writes remain. undo_last only works in the same process.
Exit status: 0 success, 1 refused operation/invalid board, 2 bad usage/input.`;

interface Invocation {
	readonly name: string;
	readonly arguments: Record<string, unknown>;
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text.replace(/^\uFEFF/, ""));
	} catch {
		throw new ToolError("input", "Input must be valid JSON.");
	}
}

async function inputJson(kind: string | undefined, value: string | undefined): Promise<unknown> {
	if (kind === undefined) return {};
	let text: string;
	if (kind === "--args") {
		text = value ?? "";
	} else {
		if (kind === "--stdin" && process.stdin.isTTY) throw new ToolError("input", "--stdin requires piped JSON input.");
		if (kind === "--input" && statSync(value ?? "").size > MAX_INPUT_BYTES) throw new ToolError("input", "Input exceeds 8 MiB.");
		if (kind === "--stdin") {
			const chunks: Buffer[] = [];
			let bytes = 0;
			for await (const chunk of process.stdin) {
				if (!Buffer.isBuffer(chunk)) throw new ToolError("input", "Stdin must supply bytes.");
				bytes += chunk.length;
				if (bytes > MAX_INPUT_BYTES) throw new ToolError("input", "Input exceeds 8 MiB.");
				chunks.push(chunk);
			}
			text = Buffer.concat(chunks).toString("utf8");
		} else text = readFileSync(value ?? "", "utf8");
	}
	if (Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES) throw new ToolError("input", "Input exceeds 8 MiB.");
	return parseJson(text);
}

function invocation(value: unknown): Invocation {
	if (!record(value) || typeof value.name !== "string" || value.name.length === 0
		|| (value.arguments !== undefined && !record(value.arguments))) {
		throw new ToolError("input", "Each call needs a tool name and an arguments object.");
	}
	return { name: value.name, arguments: record(value.arguments) ? value.arguments : {} };
}

function failed(call: Invocation, result: ToolResult): boolean {
	return result.isError || (call.name === "validate_board" && result.structuredContent?.valid === false);
}

function execute(call: Invocation, runner: ToolRunner, revisions: Map<string, string>): ToolResult {
	const args = { ...call.arguments };
	if (args.expectedRevision === "previous") {
		const previous = typeof args.path === "string" ? revisions.get(args.path) : undefined;
		if (previous === undefined) throw new ToolArgumentsError("No previous successful revision for this board in this batch.");
		args.expectedRevision = previous;
	}
	const result = runner.run(call.name, args);
	const document = result.structuredContent;
	if (!failed(call, result) && document && typeof document.path === "string" && typeof document.revision === "string") {
		const revision = document.dryRun === true ? document.previousRevision : document.revision;
		if (typeof revision === "string") revisions.set(document.path, revision);
	}
	return result;
}

async function main(argv: readonly string[]): Promise<unknown> {
	let vaultPath: string | undefined;
	let configDir = DEFAULT_CONFIG_DIR;
	let readOnly = false;
	let inputKind: string | undefined;
	let inputValue: string | undefined;
	const positional: string[] = [];
	const seen = new Set<string>();
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) {
			positional.push(token);
			continue;
		}
		const equals = token.indexOf("=");
		const name = equals < 0 ? token : token.slice(0, equals);
		if (seen.has(name)) throw new ToolError("usage", `Repeated option: ${name}`);
		seen.add(name);
		if (name === "--read-only" || name === "--stdin") {
			if (equals >= 0) throw new ToolError("usage", `${name} takes no value.`);
			if (name === "--read-only") readOnly = true;
			else {
				if (inputKind !== undefined) throw new ToolError("usage", "Choose one JSON input source.");
				inputKind = name;
			}
			continue;
		}
		if (!["--vault", "--config-dir", "--args", "--input"].includes(name)) throw new ToolError("usage", `Unknown option: ${name}`);
		const value = equals < 0 ? argv[++index] : token.slice(equals + 1);
		if (value === undefined || value === "" || value.startsWith("--")) throw new ToolError("usage", `${name} needs a value.`);
		if (name === "--vault") vaultPath = value;
		else if (name === "--config-dir") configDir = value;
		else {
			if (inputKind !== undefined) throw new ToolError("usage", "Choose one JSON input source.");
			inputKind = name;
			inputValue = value;
		}
	}
	if (!vaultPath) throw new ToolError("usage", "--vault is required. Use --help for examples.");
	const [command, toolName] = positional;
	if (command === "list" ? positional.length !== 1 || inputKind !== undefined
		: command === "call" ? positional.length !== 2
			: command === "batch" ? positional.length !== 1 || inputKind === undefined || inputKind === "--args"
				: true) throw new ToolError("usage", "Use list, call <tool>, or batch. Use --help for examples.");
	const data = await inputJson(inputKind, inputValue);
	const calls = command === "batch" ? (() => {
		if (!Array.isArray(data) || data.length === 0 || data.length > MAX_BATCH_CALLS) throw new ToolError("input", "Batch must contain 1 to 1000 calls.");
		return data.map(invocation);
	})() : [invocation({ name: toolName ?? "list_boards", arguments: data })];
	const tools = createServerTools({ vault: Vault.open(vaultPath, configDir), readOnly });
	if (command === "list") return { tools: tools.map(({ run: _run, failed: _failed, ...definition }) => definition) };
	const runner = new ToolRunner(tools);
	const revisions = new Map<string, string>();
	const results: unknown[] = [];
	for (const call of calls) {
		let result: ToolResult;
		try {
			result = execute(call, runner, revisions);
		} catch (error) {
			if (!(error instanceof ToolArgumentsError)) throw error;
			process.exitCode = 2;
			const failure = { name: call.name, error: { code: "arguments", message: error.message } };
			results.push(failure);
			return command === "batch" ? { results, completed: results.length - 1, stopped: true } : failure;
		}
		const answer = { name: call.name, ...result };
		results.push(answer);
		if (failed(call, result)) {
			process.exitCode = 1;
			return command === "batch" ? { results, completed: results.length - 1, stopped: true } : answer;
		}
	}
	return command === "batch" ? { results, completed: results.length, stopped: false } : results[0];
}

let output: unknown;
try {
	const args = process.argv.slice(2);
	if (args.length === 1 && args[0] === "--help") output = { help: USAGE };
	else if (args.length === 1 && args[0] === "--version") output = { version: packageJson.version };
	else output = await main(args);
} catch (error) {
	process.exitCode = 2;
	const code = error instanceof ToolError ? error.code : "input";
	const message = error instanceof Error ? error.message : String(error);
	output = { error: { code, message } };
	process.stderr.write(`miro-canvas-cli: ${code}: ${message}\n`);
}
process.stdout.write(`${JSON.stringify(output)}\n`);
