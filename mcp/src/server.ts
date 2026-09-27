/**
 * miro-canvas MCP server: lets an AI agent read and check miro-canvas boards
 * in one Obsidian vault, through the plugin's own code.
 *
 *   node mcp/dist/miro-canvas-mcp.mjs --vault <absolute path to the vault> [--read-only]
 *
 * The agent starts it; the plugin never does.  It speaks MCP over stdin and
 * stdout only and opens no network connection.  Everything it has to say to
 * a person goes to stderr, since stdout belongs to the protocol.
 */

import packageJson from "../../package.json";
import { McpServer, serveLines } from "./json-rpc";
import { createReadTools } from "./tools";
import { ToolError, Vault } from "./vault";

const USAGE = "usage: node miro-canvas-mcp.mjs --vault <absolute path to an Obsidian vault> [--read-only]";

interface ServerArguments {
	readonly vault: string;
	readonly readOnly: boolean;
}

function parseArguments(argv: readonly string[]): ServerArguments {
	let vault: string | undefined;
	let readOnly = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--vault") {
			vault = argv[index + 1];
			index += 1;
		} else if (argument.startsWith("--vault=")) {
			vault = argument.slice("--vault=".length);
		} else if (argument === "--read-only") {
			readOnly = true;
		} else {
			throw new ToolError("usage", `Unknown argument: ${argument}\n${USAGE}`);
		}
	}
	if (vault === undefined || vault === "") throw new ToolError("usage", USAGE);
	return { vault, readOnly };
}

async function main(): Promise<void> {
	// stdout carries the protocol; a stray log line would break it.
	console.log = console.error;
	console.info = console.error;
	console.debug = console.error;
	let settings: ServerArguments;
	let vault: Vault;
	try {
		settings = parseArguments(process.argv.slice(2));
		vault = Vault.open(settings.vault);
	} catch (error) {
		process.stderr.write(`miro-canvas-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 2;
		return;
	}
	// Only reading tools exist so far; --read-only is accepted for the edit tools to come.
	const server = new McpServer({
		name: "miro-canvas",
		version: packageJson.version,
		tools: createReadTools({ vault }),
		instructions: "Boards are .canvas files in the vault, named by their path inside it. Read one with read_board "
			+ "(summary first, then items in pages) and check one with validate_board. miroSource is the Miro import: "
			+ "evidence, never to be changed.",
	});
	process.stderr.write(`miro-canvas-mcp ${packageJson.version}: vault ${vault.realRoot}${settings.readOnly ? " (read-only)" : ""}\n`);
	await serveLines(server, process.stdin, process.stdout);
}

main().catch((error: unknown) => {
	process.stderr.write(`miro-canvas-mcp: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
	process.exitCode = 1;
});
