/**
 * miro-canvas MCP server: lets an AI agent read, check and change
 * miro-canvas boards in one Obsidian vault, through the plugin's own code.
 * With --read-only it only reads and checks.
 *
 *   node mcp/dist/miro-canvas-mcp.mjs --vault <absolute path to the vault> [--read-only]
 *
 * The agent starts it; the plugin never does.  It speaks MCP over stdin and
 * stdout only and opens no network connection.  Everything it has to say to
 * a person goes to stderr, since stdout belongs to the protocol.
 */

import packageJson from "../../package.json";
import { McpServer, serveLines } from "./json-rpc";
import { createServerTools } from "./tools-edit";
import { DEFAULT_CONFIG_DIR, ToolError, Vault } from "./vault";

const USAGE = "usage: node miro-canvas-mcp.mjs --vault <absolute path to an Obsidian vault> [--config-dir <relative folder>] [--read-only]";

interface ServerArguments {
	readonly vault: string;
	readonly readOnly: boolean;
	readonly configDir: string;
}

function parseArguments(argv: readonly string[]): ServerArguments {
	let vault: string | undefined;
	let readOnly = false;
	let configDir = DEFAULT_CONFIG_DIR;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--vault") {
			vault = argv[index + 1];
			index += 1;
		} else if (argument.startsWith("--vault=")) {
			vault = argument.slice("--vault=".length);
		} else if (argument === "--config-dir") {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("--")) throw new ToolError("usage", USAGE);
			configDir = value;
			index += 1;
		} else if (argument.startsWith("--config-dir=")) {
			configDir = argument.slice("--config-dir=".length);
		} else if (argument === "--read-only") {
			readOnly = true;
		} else {
			throw new ToolError("usage", `Unknown argument: ${argument}\n${USAGE}`);
		}
	}
	if (vault === undefined || vault === "") throw new ToolError("usage", USAGE);
	return { vault, readOnly, configDir };
}

async function main(): Promise<void> {
	let settings: ServerArguments;
	let vault: Vault;
	try {
		settings = parseArguments(process.argv.slice(2));
		vault = Vault.open(settings.vault, settings.configDir);
	} catch (error) {
		process.stderr.write(`miro-canvas-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 2;
		return;
	}
	// With --read-only the tools that change boards do not exist at all.
	const tools = createServerTools({ vault, readOnly: settings.readOnly });
	const editing = settings.readOnly
		? ""
		: " Change one with the edit tools, handing back the revision read_board gave as expectedRevision: a board saved "
			+ "since is refused (stale-board) instead of written over. dryRun checks a change without writing it.";
	const server = new McpServer({
		name: "miro-canvas",
		version: packageJson.version,
		tools,
		instructions: "Boards are .canvas files in the vault, named by their path inside it. Read one with read_board "
			+ "(summary first, then items in pages) and check one with validate_board." + editing + " miroSource is the Miro "
			+ "import: evidence, never to be changed.",
	});
	process.stderr.write(`miro-canvas-mcp ${packageJson.version}: vault ${vault.realRoot}${settings.readOnly ? " (read-only)" : ""}\n`);
	await serveLines(server, process.stdin, process.stdout);
}

main().catch((error: unknown) => {
	process.stderr.write(`miro-canvas-mcp: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
	process.exitCode = 1;
});
