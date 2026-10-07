/** Real CLI processes over disposable, project-local vaults; never a person's vault. */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";

import packageJson from "../../package.json";
import { FIXTURES_DIR, REPOSITORY_ROOT } from "./helpers";

type Answer = Record<string, any>;
interface Invocation {
	readonly name: string;
	readonly arguments: Record<string, unknown>;
}

const artifacts = path.join(REPOSITORY_ROOT, "tools/obsidian_cdp/.out/cli-test-artifacts");
let runDirectory: string;
let executable: string;
let runnerProbe: string;
let processNumber = 0;

beforeAll(async () => {
	mkdirSync(artifacts, { recursive: true });
	runDirectory = mkdtempSync(path.join(artifacts, "run-"));
	executable = path.join(runDirectory, "miro-canvas-cli.mjs");
	const url = pathToFileURL(path.join(REPOSITORY_ROOT, "esbuild.mcp.mjs")).href;
	const { mcpBuildOptions } = await import(/* @vite-ignore */ url);
	const result = await esbuild.build({
		...mcpBuildOptions(REPOSITORY_ROOT, "cli"), outfile: executable,
		write: false, metafile: true, logLevel: "silent",
	});
	const output = result.outputFiles?.[0];
	if (output === undefined) throw new Error("The isolated CLI build produced no executable.");
	writeFileSync(executable, output.contents);
	writeFileSync(path.join(runDirectory, "bundle-metafile.json"), JSON.stringify(result.metafile, null, 2));
	runnerProbe = path.join(runDirectory, "unknown-format-runner.mjs");
	const probe = await esbuild.build({
		stdin: {
			resolveDir: REPOSITORY_ROOT, loader: "ts",
			contents: `import { ToolRunner } from "./mcp/src/tool-runner";
const runner = new ToolRunner([{
	name: "probe", title: "Probe", description: "Unknown schema format",
	inputSchema: { type: "object", properties: { value: { type: "string", format: "future-cli-format" } }, required: ["value"] },
	outputSchema: { type: "object" }, run: args => ({ value: args.value }),
}]);
process.stdout.write(JSON.stringify(runner.run("probe", { value: "accepted" })) + "\\n");`,
		},
		outfile: runnerProbe, bundle: true, platform: "node", format: "esm", target: "node20",
		write: false, logLevel: "silent",
	});
	const probeOutput = probe.outputFiles?.[0];
	if (probeOutput === undefined) throw new Error("The isolated runner build produced no executable.");
	writeFileSync(runnerProbe, probeOutput.contents);
});

function readJson(file: string): Answer {
	return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

describe.each(["input", "stdin"])("CLI byte limit through %s", mode => {
	it("accepts exactly 8 MiB and refuses one extra byte without changing the board", () => {
		const root = makeVault();
		const file = path.join(root, "Ю.canvas");
		copyFileSync(path.join(root, "board.canvas"), file);
		const original = readFileSync(file);
		const json = JSON.stringify({ path: "Ю.canvas" });
		const text = json + " ".repeat(8 * 1024 * 1024 - Buffer.byteLength(json, "utf8"));
		for (const extra of ["", " "]) {
			const input = text + extra;
			const inputPath = path.join(root, "args.json");
			writeFileSync(inputPath, input);
			const argv = ["--vault", root, "call", "read_board"];
			const result = mode === "input" ? run([...argv, "--input", inputPath]) : run([...argv, "--stdin"], input);
			expect(result.status).toBe(extra === "" ? 0 : 2);
			if (extra !== "") expect(result.answer.error.message).toContain("8 MiB");
			expect(readFileSync(file)).toEqual(original);
		}
	});
});

it("waits for delayed stdin chunks and preserves a split UTF-8 filename", async () => {
	const root = makeVault();
	copyFileSync(path.join(root, "board.canvas"), path.join(root, "Ю.canvas"));
	const original = readFileSync(path.join(root, "Ю.canvas"));
	const payload = Buffer.from(JSON.stringify({ path: "Ю.canvas" }));
	const split = payload.indexOf(Buffer.from("Ю")) + 1;
	const answer = await new Promise<Answer>((resolve, reject) => {
		const child = spawn(process.execPath, [executable, "--vault", root, "call", "read_board", "--stdin"], { windowsHide: true });
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => { child.kill(); reject(new Error("Delayed stdin process timed out.")); }, 10000);
		child.stdout.on("data", (data: Buffer) => { stdout += data.toString("utf8"); });
		child.stderr.on("data", (data: Buffer) => { stderr += data.toString("utf8"); });
		child.on("error", reject);
		child.stdin.on("error", reject);
		child.on("close", code => {
			clearTimeout(timeout);
			if (code !== 0) reject(new Error(`CLI exited ${code}: ${stderr} ${stdout}`));
			else {
				try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
			}
		});
		child.stdin.write(payload.subarray(0, split));
		setTimeout(() => child.stdin.end(payload.subarray(split)), 150);
	});
	expect(answer.structuredContent.path).toBe("Ю.canvas");
	expect(answer.isError).toBe(false);
	expect(readFileSync(path.join(root, "Ю.canvas"))).toEqual(original);
});

function revision(file: string): string {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function makeVault(configDir = ".obsidian"): string {
	const root = mkdtempSync(path.join(runDirectory, "vault-"));
	mkdirSync(path.join(root, configDir), { recursive: true });
	const document = readJson(path.join(FIXTURES_DIR, "valid/plugin-authored-board.canvas"));
	document.futureCliField = { sentinel: "root", nested: [null, false, "Юникод"] };
	for (const [index, node] of document.nodes.entries()) node.futureCliField = { sentinel: `node-${index}` };
	document.edges[0].futureCliField = { sentinel: "edge" };
	document.miroCanvas.futureCliField = { sentinel: "metadata" };
	document.miroCanvas.settings.futureCliField = { sentinel: "settings" };
	document.miroCanvas.bindings["card-1"].futureCliField = { sentinel: "binding" };
	document.miroCanvas.localOverrides["sticky-1"].futureCliField = { sentinel: "override" };
	document.miroCanvas.localOverrides["sticky-1"].typography.futureCliField = { sentinel: "typography" };
	document.miroCanvas.connectors["conn-1"].futureCliField = { sentinel: "connector" };
	document.miroCanvas.connectors["conn-1"].from.futureCliField = { sentinel: "anchor" };
	document.miroCanvas.localComments[0].futureCliField = { sentinel: "comment" };
	document.miroCanvas.localComments[0].replies[0].futureCliField = { sentinel: "reply" };
	document.miroCanvas.export.pages[0].futureCliField = { sentinel: "page" };
	document.miroSource.futureCliField = { sentinel: "source", items: [1, 2, 3] };
	writeFileSync(path.join(root, "board.canvas"), JSON.stringify(document, null, 2) + "\r\n");
	return root;
}

function run(argv: string[], input = "", program = executable) {
	const result = spawnSync(process.execPath, [program, ...argv], {
		cwd: REPOSITORY_ROOT, input, encoding: "utf8", timeout: 10_000,
		maxBuffer: 16 * 1024 * 1024, windowsHide: true,
	});
	if (result.error) throw result.error;
	expect(result.signal).toBeNull();
	const label = `process-${++processNumber}`;
	writeFileSync(path.join(runDirectory, `${label}.stdout.txt`), result.stdout);
	writeFileSync(path.join(runDirectory, `${label}.stderr.txt`), result.stderr);
	// Parsing the whole stream also catches extra JSON values or Ajv diagnostic chatter.
	expect(result.stdout.endsWith("\n")).toBe(true);
	expect(result.stdout.trim().split(/\r?\n/)).toHaveLength(1);
	const answer: Answer = JSON.parse(result.stdout);
	return { ...result, answer };
}

function call(root: string, name: string, args: Record<string, unknown>, options: string[] = []) {
	return run(["--vault", root, ...options, "call", name, "--args", JSON.stringify(args)]);
}

function batch(root: string, calls: readonly Invocation[], options: string[] = []) {
	return run(["--vault", root, ...options, "batch", "--stdin"], JSON.stringify(calls));
}

function edit(text: string, extra: Record<string, unknown> = {}): Invocation {
	return { name: "update_node", arguments: { path: "board.canvas", id: "card-1", text, ...extra } };
}

function assertUnchanged(root: string, original: Buffer): void {
	expect(readFileSync(path.join(root, "board.canvas"))).toEqual(original);
	expect(readdirSync(root).filter(name => name.endsWith(".mcp-tmp"))).toEqual([]);
}

describe("CLI discovery and read-only operations", () => {
	it("keeps shared-runner unknown-format compilation silent on stdout and stderr", () => {
		const result = run([], "", runnerProbe);
		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.answer).toMatchObject({ isError: false, structuredContent: { value: "accepted" } });
	});

	it("prints JSON help and version without opening a vault", () => {
		const help = run(["--help"]);
		expect(help.status).toBe(0);
		expect(help.stderr).toBe("");
		expect(help.answer.help).toContain("expectedRevision");
		expect(help.answer.help).toContain("undo_last");
		const version = run(["--version"]);
		expect(version.status).toBe(0);
		expect(version.stderr).toBe("");
		expect(version.answer).toEqual({ version: packageJson.version });
	});

	it("lists serializable schemas and hides every writer in read-only mode", () => {
		const root = makeVault();
		const original = readFileSync(path.join(root, "board.canvas"));
		const all = run(["--vault", root, "list"]);
		expect(all.status).toBe(0);
		expect(all.stderr).toBe("");
		expect(all.answer.tools.map((tool: Answer) => tool.name)).toEqual([
			"list_boards", "read_board", "validate_board", "add_item", "add_card", "add_shape",
			"update_node", "move", "set_style", "rotate", "connect", "update_connector", "delete",
			"layer", "lock", "comment", "undo_last",
		]);
		for (const tool of all.answer.tools) {
			expect(tool.inputSchema.type).toBe("object");
			expect(tool.outputSchema.type).toBe("object");
			expect(tool).not.toHaveProperty("run");
			expect(tool).not.toHaveProperty("failed");
		}
		const readonly = run(["--vault", root, "--read-only", "list"]);
		expect(readonly.status).toBe(0);
		expect(readonly.answer.tools).toEqual(all.answer.tools.filter((tool: Answer) => tool.annotations.readOnlyHint));
		expect(readonly.answer.tools.map((tool: Answer) => tool.name)).toEqual(["list_boards", "read_board", "validate_board"]);
		const refused = call(root, "update_node", edit("blocked").arguments, ["--read-only"]);
		expect(refused.status).toBe(2);
		expect(refused.answer.error).toMatchObject({ code: "arguments", message: expect.stringContaining("Unknown tool") });
		expect(call(root, "validate_board", { path: "board.canvas" }, ["--read-only"]).status).toBe(0);
		assertUnchanged(root, original);
	});

	it("reads, validates and edits while preserving source and every other field exactly", () => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		const original = readFileSync(file);
		const before = readJson(file);
		const read = call(root, "read_board", { path: "board.canvas", level: "full" });
		expect(read.status).toBe(0);
		expect(read.stderr).toBe("");
		expect(read.answer.isError).toBe(false);
		const { miroSource, ...fullDocument } = before;
		expect(read.answer.structuredContent.document).toStrictEqual(fullDocument);
		expect(read.answer.structuredContent.revision).toBe(revision(file));
		expect(JSON.parse(read.answer.content[0].text)).toStrictEqual(read.answer.structuredContent);
		const source = call(root, "read_board", { path: "board.canvas", sourcePointer: "" });
		expect(source.status).toBe(0);
		expect(source.answer.structuredContent.source.value).toStrictEqual(miroSource);
		const valid = call(root, "validate_board", { path: "board.canvas" });
		expect(valid.status).toBe(0);
		expect(valid.answer.structuredContent.valid).toBe(true);
		assertUnchanged(root, original);
		const changed = call(root, "update_node", edit("Changed\nЮникод", { expectedRevision: revision(file) }).arguments);
		expect(changed.status).toBe(0);
		expect(changed.answer.structuredContent).toMatchObject({ status: "applied", written: true, changedIds: ["card-1"] });
		const expected = structuredClone(before);
		expected.nodes[0].text = "Changed\nЮникод";
		expect(readJson(file)).toStrictEqual(expected);
		expect(changed.answer.structuredContent.revision).toBe(revision(file));
		expect(call(root, "validate_board", { path: "board.canvas" }).status).toBe(0);
	});

	it("returns status 1 when validate_board reports an invalid board", () => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		copyFileSync(path.join(FIXTURES_DIR, "invalid/node-missing-geometry.canvas"), file);
		const original = readFileSync(file);
		const result = call(root, "validate_board", { path: "board.canvas" });
		expect(result.status).toBe(1);
		expect(result.answer.structuredContent.valid).toBe(false);
		expect(result.answer.structuredContent.schema.length).toBeGreaterThan(0);
		expect(result.stderr).toBe("");
		assertUnchanged(root, original);
	});
});

describe("CLI input and invocation failures", () => {
	it.each(["args", "input", "stdin"])("accepts UTF-8 JSON through %s", kind => {
		const root = makeVault();
		const original = readFileSync(path.join(root, "board.canvas"));
		const args = JSON.stringify({ path: "board.canvas", sourcePointer: "" });
		let options: string[];
		if (kind === "input") {
			const file = path.join(root, "аргументы с пробелом.json");
			writeFileSync(file, `\uFEFF${args}`);
			options = ["--input", file];
		} else options = kind === "stdin" ? ["--stdin"] : [`--args=${args}`];
		const result = run([`--vault=${root}`, "call", "read_board", ...options], kind === "stdin" ? `\uFEFF${args}` : "");
		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.answer.structuredContent.source.value).toStrictEqual(readJson(path.join(root, "board.canvas")).miroSource);
		assertUnchanged(root, original);
	});

	it("uses an empty arguments object when call has no input source", () => {
		const root = makeVault();
		const result = run(["--vault", root, "call", "list_boards"]);
		expect(result.status).toBe(0);
		expect(result.answer.structuredContent.boards.map((board: Answer) => board.path)).toEqual(["board.canvas"]);
	});

	it.each(["args", "input", "stdin"])("rejects malformed JSON through %s before writes", kind => {
		const root = makeVault();
		const original = readFileSync(path.join(root, "board.canvas"));
		const malformed = '{"path":"board.canvas","id":"card-1","text":"bad",';
		const file = path.join(root, "bad.json");
		writeFileSync(file, malformed);
		const options = kind === "args" ? ["--args", malformed] : kind === "input" ? ["--input", file] : ["--stdin"];
		const result = run(["--vault", root, "call", "update_node", ...options], kind === "stdin" ? malformed : "");
		expect(result.status).toBe(2);
		expect(result.answer.error.code).toBe("input");
		expect(result.stderr).toMatch(/^miro-canvas-cli: input:/);
		assertUnchanged(root, original);
	});

	it.each([
		{ name: "update_node", args: { path: "board.canvas", text: "missing id" } },
		{ name: "update_node", args: { path: "board.canvas", id: "card-1", text: 42 } },
		{ name: "update_node", args: { path: "board.canvas", id: "card-1", width: 0 } },
		{ name: "update_node", args: { path: "board.canvas", id: "card-1", text: "bad", unexpected: true } },
		{ name: "not_a_tool", args: { path: "board.canvas" } },
	])("rejects schema/unknown-tool input for $name: $args", ({ name, args }) => {
		const root = makeVault();
		const original = readFileSync(path.join(root, "board.canvas"));
		const result = call(root, name, args);
		expect(result.status).toBe(2);
		expect(result.answer.error.code).toBe("arguments");
		assertUnchanged(root, original);
	});

	it.each(["null", "[]", '"text"', "42"])("rejects non-object call arguments %s", input => {
		const root = makeVault();
		const original = readFileSync(path.join(root, "board.canvas"));
		const result = run(["--vault", root, "call", "update_node", "--args", input]);
		expect(result.status).toBe(2);
		expect(result.answer.error.code).toBe("input");
		assertUnchanged(root, original);
	});

	it.each([
		[], ["list"], ["--vault"], ["--vault", "relative-vault", "list"],
		["--vault", "$vault", "unknown"], ["--vault", "$vault", "call"],
		["--vault", "$vault", "list", "extra"], ["--vault", "$vault", "call", "read_board", "extra"],
		["--vault", "$vault", "list", "--args", "{}"],
		["--vault", "$vault", "batch"], ["--vault", "$vault", "batch", "--args", "[]"],
		["--vault", "$vault", "call", "read_board", "--stdin", "--args", "{}"],
		["--vault", "$vault", "call", "read_board", "--input", "missing.json", "--stdin"],
		["--vault", "$vault", "list", "--read-only=true"],
		["--vault", "$vault", "list", "--read-only", "--read-only"],
		["--vault", "$vault", "list", "--vault", "$vault"],
		["--vault", "$vault", "list", "--unknown"],
		["--vault", "$vault", "list", "--config-dir="],
	].map(argv => ({ argv })))("returns JSON status 2 for bad usage $argv", ({ argv }) => {
		const root = makeVault();
		const original = readFileSync(path.join(root, "board.canvas"));
		const result = run(argv.map(token => token === "$vault" ? root : token));
		expect(result.status).toBe(2);
		expect(result.answer.error.code).toMatch(/^(usage|vault-invalid)$/);
		expect(result.stderr).toMatch(/^miro-canvas-cli:/);
		assertUnchanged(root, original);
	});

	it("returns JSON status 2 for an unreadable input file", () => {
		const root = makeVault();
		const original = readFileSync(path.join(root, "board.canvas"));
		const result = run(["--vault", root, "call", "update_node", "--input", path.join(root, "missing.json")]);
		expect(result.status).toBe(2);
		expect(result.answer.error.code).toBe("input");
		assertUnchanged(root, original);
	});
});

describe("CLI board safeguards", () => {
	it("opens only the selected Config and protects configuration/trash without hiding sibling prefixes", () => {
		const root = makeVault("Config");
		const file = path.join(root, "board.canvas");
		const original = readFileSync(file);
		for (const folder of ["Config", ".obsidian", ".trash", "Config-other"]) {
			mkdirSync(path.join(root, folder), { recursive: true });
			writeFileSync(path.join(root, folder, "private.canvas"), original);
		}
		writeFileSync(path.join(root, "Config", "workspace.json"), JSON.stringify({ type: "canvas", state: { file: "board.canvas" } }));
		const options = ["--config-dir=Config"];
		const listed = call(root, "list_boards", {}, options);
		expect(listed.status).toBe(0);
		expect(listed.answer.structuredContent.boards.map((board: Answer) => board.path)).toEqual(["Config-other/private.canvas", "board.canvas"]);
		for (const folder of ["Config", "CONFIG", ".obsidian", ".trash"]) {
			for (const name of ["read_board", "update_node"]) {
				const args = name === "read_board" ? {} : { id: "card-1", text: "blocked" };
				const refused = call(root, name, { path: `${folder}/private.canvas`, ...args }, options);
				expect(refused.status).toBe(1);
				expect(refused.answer.isError).toBe(true);
				expect(refused.answer.content[0].text).toMatch(/^path-protected:/);
			}
		}
		const dry = call(root, "update_node", edit("dry", { dryRun: true }).arguments, options);
		expect(dry.status).toBe(0);
		expect(dry.answer.structuredContent.warnings.map((warning: Answer) => warning.code)).toContain("open-in-obsidian");
		assertUnchanged(root, original);
		for (const folder of ["Config", ".obsidian", ".trash", "Config-other"]) {
			expect(readFileSync(path.join(root, folder, "private.canvas"))).toEqual(original);
		}
	});

	it("supports a custom vault without .obsidian", () => {
		const root = makeVault("Config");
		expect(run(["--vault", root, "list"]).status).toBe(2);
		const result = call(root, "read_board", { path: "board.canvas" }, ["--config-dir", "Config"]);
		expect(result.status).toBe(0);
	});

	it("refuses traversal for reads and writes without touching an outside board", () => {
		const root = makeVault();
		const outside = makeVault();
		const outsideFile = path.join(outside, "board.canvas");
		const original = readFileSync(path.join(root, "board.canvas"));
		const outsideOriginal = readFileSync(outsideFile);
		const traversal = path.relative(root, outsideFile).split(path.sep).join("/");
		for (const name of ["read_board", "update_node"]) {
			const args = name === "read_board" ? {} : { id: "card-1", text: "escaped" };
			const result = call(root, name, { path: traversal, ...args });
			expect(result.status).toBe(1);
			expect(result.answer.content[0].text).toMatch(/^path-invalid:/);
		}
		assertUnchanged(root, original);
		expect(readFileSync(outsideFile)).toEqual(outsideOriginal);
	});

	it("rejects a stale read revision after a newer save", () => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		const read = call(root, "read_board", { path: "board.canvas" });
		const document = readJson(file);
		document.nodes[0].text = "newer save";
		writeFileSync(file, JSON.stringify(document));
		const newer = readFileSync(file);
		const refused = call(root, "update_node", edit("stale", { expectedRevision: read.answer.structuredContent.revision }).arguments);
		expect(refused.status).toBe(1);
		expect(refused.answer.isError).toBe(true);
		expect(refused.answer.structuredContent).toMatchObject({ status: "rejected", written: false });
		expect(refused.answer.structuredContent.diagnostics[0].code).toBe("stale-board");
		assertUnchanged(root, newer);
	});

	it.each(["lock", "review"])("refuses a card edit under %s", protection => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		if (protection === "lock") {
			const locked = call(root, "lock", { path: "board.canvas", ids: ["card-1"], locked: true });
			expect(locked.status).toBe(0);
		} else {
			const document = readJson(file);
			document.miroCanvas.settings.reviewMode = true;
			writeFileSync(file, JSON.stringify(document));
		}
		const original = readFileSync(file);
		const result = call(root, "update_node", edit("protected").arguments);
		expect(result.status).toBe(1);
		expect(result.answer.isError).toBe(true);
		expect(result.answer.structuredContent).toMatchObject({ status: "rejected", written: false });
		expect(result.answer.structuredContent.diagnostics.length).toBeGreaterThan(0);
		assertUnchanged(root, original);
	});

	it("dry-runs a change without saving it or creating undo history", () => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		const original = readFileSync(file);
		const actualRevision = revision(file);
		const result = call(root, "update_node", edit("hypothetical", { dryRun: true, expectedRevision: actualRevision }).arguments);
		expect(result.status).toBe(0);
		expect(result.answer.structuredContent).toMatchObject({ status: "applied", dryRun: true, written: false, previousRevision: actualRevision });
		expect(result.answer.structuredContent.revision).not.toBe(actualRevision);
		assertUnchanged(root, original);
		const undo = batch(root, [edit("dry", { dryRun: true }), { name: "undo_last", arguments: { path: "board.canvas", expectedRevision: "previous" } }]);
		expect(undo.status).toBe(1);
		expect(undo.answer.completed).toBe(1);
		expect(undo.answer.results[1].structuredContent.diagnostics[0].code).toBe("nothing-to-undo");
		assertUnchanged(root, original);
	});
});

describe("CLI sequential batches", () => {
	it.each(["stdin", "input"])("reads, edits twice, undoes the last edit and hands off revisions through %s", kind => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		const before = readJson(file);
		const initialRevision = revision(file);
		const calls: Invocation[] = [
			{ name: "read_board", arguments: { path: "board.canvas" } },
			edit("first", { expectedRevision: "previous" }),
			edit("second", { expectedRevision: "previous" }),
			{ name: "undo_last", arguments: { path: "board.canvas", expectedRevision: "previous" } },
			{ name: "read_board", arguments: { path: "board.canvas", level: "full" } },
			edit("after undo", { expectedRevision: "previous" }),
		];
		const inputFile = path.join(root, "batch.json");
		writeFileSync(inputFile, JSON.stringify(calls));
		const result = kind === "stdin" ? batch(root, calls) : run(["--vault", root, "batch", "--input", inputFile]);
		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.answer).toMatchObject({ completed: calls.length, stopped: false });
		expect(result.answer.results.map((answer: Answer) => answer.name)).toEqual(calls.map(call => call.name));
		expect(result.answer.results.every((answer: Answer) => answer.isError === false)).toBe(true);
		const documents = result.answer.results.map((answer: Answer) => answer.structuredContent);
		expect(documents[0].revision).toBe(initialRevision);
		expect(documents[1].previousRevision).toBe(documents[0].revision);
		expect(documents[2].previousRevision).toBe(documents[1].revision);
		expect(documents[2].revision).not.toBe(documents[1].revision);
		expect(documents[3]).toMatchObject({ written: true, revision: documents[1].revision, previousRevision: documents[2].revision, created: { undone: "update_node" } });
		expect(documents[4].document.nodes[0].text).toBe("first");
		expect(documents[4].revision).toBe(documents[1].revision);
		expect(documents[5].previousRevision).toBe(documents[1].revision);
		expect(documents[5].revision).toBe(revision(file));
		before.nodes[0].text = "after undo";
		expect(readJson(file)).toStrictEqual(before);
	});

	it("undo restores the exact original bytes and cannot persist across processes", () => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		const original = readFileSync(file);
		const undone = batch(root, [edit("temporary"), { name: "undo_last", arguments: { path: "board.canvas", expectedRevision: "previous" } }]);
		expect(undone.status).toBe(0);
		assertUnchanged(root, original);
		expect(call(root, "update_node", edit("persisted").arguments).status).toBe(0);
		const persisted = readFileSync(file);
		const separateUndo = call(root, "undo_last", { path: "board.canvas" });
		expect(separateUndo.status).toBe(1);
		expect(separateUndo.answer.structuredContent.diagnostics[0].code).toBe("nothing-to-undo");
		assertUnchanged(root, persisted);
	});

	it.each(["refusal", "schema", "validation"])("stops at the first %s and keeps the committed prefix", failure => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		copyFileSync(path.join(FIXTURES_DIR, "invalid/node-missing-geometry.canvas"), path.join(root, "invalid.canvas"));
		const failingCall: Invocation = failure === "refusal" ? edit("missing", { id: "missing-card", expectedRevision: "previous" })
			: failure === "schema" ? { name: "update_node", arguments: { path: "board.canvas", text: "missing id" } }
				: { name: "validate_board", arguments: { path: "invalid.canvas" } };
		const result = batch(root, [edit("committed"), failingCall, edit("must not run")]);
		expect(result.status).toBe(failure === "schema" ? 2 : 1);
		expect(result.answer).toMatchObject({ completed: 1, stopped: true });
		expect(result.answer.results).toHaveLength(2);
		expect(result.answer.results[0].structuredContent.written).toBe(true);
		expect(readJson(file).nodes[0].text).toBe("committed");
		expect(revision(file)).toBe(result.answer.results[0].structuredContent.revision);
		if (failure === "schema") expect(result.answer.results[1].error.code).toBe("arguments");
		else if (failure === "validation") expect(result.answer.results[1].structuredContent.valid).toBe(false);
		else expect(result.answer.results[1].isError).toBe(true);
	});

	it.each([null, {}, { name: "" }, { name: "read_board", arguments: [] }, { name: "read_board", arguments: null }])(
		"checks every call shape before effects, including malformed tail %j", invalid => {
			const root = makeVault();
			const original = readFileSync(path.join(root, "board.canvas"));
			const result = run(["--vault", root, "batch", "--stdin"], JSON.stringify([edit("must not run"), invalid]));
			expect(result.status).toBe(2);
			expect(result.answer.error.code).toBe("input");
			expect(result.answer).not.toHaveProperty("results");
			assertUnchanged(root, original);
		},
	);

	it.each([{}, [], Array.from({ length: 1001 }, () => ({ name: "list_boards", arguments: {} }))])(
		"rejects a non-array, empty or oversized batch %#", input => {
			const root = makeVault();
			const original = readFileSync(path.join(root, "board.canvas"));
			const result = run(["--vault", root, "batch", "--stdin"], JSON.stringify(input));
			expect(result.status).toBe(2);
			expect(result.answer.error.code).toBe("input");
			assertUnchanged(root, original);
		},
	);

	it("rejects malformed batch JSON before the valid-looking prefix can run", () => {
		const root = makeVault();
		const original = readFileSync(path.join(root, "board.canvas"));
		const result = run(["--vault", root, "batch", "--stdin"], `[${JSON.stringify(edit("must not run"))},`);
		expect(result.status).toBe(2);
		expect(result.answer.error.code).toBe("input");
		assertUnchanged(root, original);
	});

	it("tracks the most recent revision of the same board despite interleaved other-board reads", () => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		const otherFile = path.join(root, "other.canvas");
		const other = readJson(file);
		other.nodes[0].text = "another board";
		writeFileSync(otherFile, JSON.stringify(other));
		const originalOther = readFileSync(otherFile);
		const result = batch(root, [
			{ name: "read_board", arguments: { path: "board.canvas" } },
			edit("first", { expectedRevision: "previous" }),
			{ name: "read_board", arguments: { path: "other.canvas" } },
			edit("second", { expectedRevision: "previous" }),
		]);
		expect(result.status).toBe(0);
		const documents = result.answer.results.map((answer: Answer) => answer.structuredContent);
		expect(documents[3].previousRevision).toBe(documents[1].revision);
		expect(documents[3].previousRevision).not.toBe(documents[2].revision);
		expect(readJson(file).nodes[0].text).toBe("second");
		expect(readFileSync(otherFile)).toEqual(originalOther);
	});

	it("cannot borrow another board's previous revision even when their bytes match", () => {
		const root = makeVault();
		const original = readFileSync(path.join(root, "board.canvas"));
		const otherFile = path.join(root, "other.canvas");
		writeFileSync(otherFile, original);
		const result = batch(root, [
			{ name: "read_board", arguments: { path: "board.canvas" } },
			edit("borrowed", { path: "other.canvas", expectedRevision: "previous" }),
			edit("must not run"),
		]);
		expect(result.status).toBe(2);
		expect(result.answer).toMatchObject({ completed: 1, stopped: true });
		expect(result.answer.results).toHaveLength(2);
		expect(result.answer.results[1].error).toMatchObject({ code: "arguments", message: expect.stringContaining("No previous successful revision") });
		assertUnchanged(root, original);
		expect(readFileSync(otherFile)).toEqual(original);
	});

	it("uses a dry run's actual previousRevision for the next write", () => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		const originalRevision = revision(file);
		const result = batch(root, [
			edit("first hypothetical", { dryRun: true }),
			edit("second hypothetical", { dryRun: true, expectedRevision: "previous" }),
			edit("committed", { expectedRevision: "previous" }),
		]);
		expect(result.status).toBe(0);
		const documents = result.answer.results.map((answer: Answer) => answer.structuredContent);
		for (const document of documents.slice(0, 2)) {
			expect(document).toMatchObject({ dryRun: true, written: false, previousRevision: originalRevision });
			expect(document.revision).not.toBe(originalRevision);
		}
		expect(documents[2]).toMatchObject({ written: true, previousRevision: originalRevision, revision: revision(file) });
		expect(readJson(file).nodes[0].text).toBe("committed");
	});

	it("keeps the last committed undo entry through an intervening dry run", () => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		const original = readFileSync(file);
		const result = batch(root, [
			edit("committed"),
			edit("hypothetical", { dryRun: true, expectedRevision: "previous" }),
			{ name: "undo_last", arguments: { path: "board.canvas", expectedRevision: "previous" } },
		]);
		expect(result.status).toBe(0);
		const documents = result.answer.results.map((answer: Answer) => answer.structuredContent);
		expect(documents[1]).toMatchObject({ written: false, previousRevision: documents[0].revision });
		expect(documents[1].revision).not.toBe(documents[0].revision);
		expect(documents[2]).toMatchObject({ written: true, previousRevision: documents[0].revision, revision: revision(file) });
		assertUnchanged(root, original);
	});

	it("does not accept previous outside a batch with an earlier successful same-board result", () => {
		const root = makeVault();
		const original = readFileSync(path.join(root, "board.canvas"));
		for (const result of [call(root, "update_node", edit("bad", { expectedRevision: "previous" }).arguments), batch(root, [edit("bad", { expectedRevision: "previous" })])]) {
			expect(result.status).toBe(2);
			const failure = result.answer.results?.[0] ?? result.answer;
			expect(failure.error.code).toBe("arguments");
		}
		assertUnchanged(root, original);
	});
});
