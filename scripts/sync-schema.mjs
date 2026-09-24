// Keeps schema/v1 equal to the board schema miro2obsidian published at the
// commit schema/pin.json names.
//
//   node scripts/sync-schema.mjs           download the pinned files into schema/v1
//   node scripts/sync-schema.mjs --check   exit 1 when the copy differs from them
//
// The plugin never reads these files at runtime; tests/schema-fixtures.test.ts
// runs the fixtures through the plugin's own reader so the two cannot drift.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = join(ROOT, "schema", "v1");
const pin = JSON.parse(await readFile(join(ROOT, "schema", "pin.json"), "utf8"));
const check = process.argv.includes("--check");

const base = `https://raw.githubusercontent.com/${pin.repository}/${pin.commit}/${pin.path}`;

async function fetchText(relative) {
	const response = await fetch(`${base}/${relative}`);
	if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
	return response.text();
}

// The schemas, the manifest, and every fixture the manifest names.
const manifestText = await fetchText("fixtures/manifest.json");
const manifest = JSON.parse(manifestText);
const files = [
	"board.schema.json",
	"miro-source.schema.json",
	"miro-canvas.schema.json",
	"fixtures/manifest.json",
	...manifest.fixtures.map((fixture) => `fixtures/${fixture.path}`),
];

// Line endings are a checkout's business, not the schema's.
const normalize = (text) => text.replace(/\r\n/g, "\n");

let differences = 0;
for (const file of files) {
	const remote = file === "fixtures/manifest.json" ? manifestText : await fetchText(file);
	const target = join(LOCAL, file);
	if (check) {
		let local = "";
		try {
			local = await readFile(target, "utf8");
		} catch {
			// A missing file counts as a difference.
		}
		if (normalize(local) !== normalize(remote)) {
			differences += 1;
			console.error(`differs: schema/v1/${file}`);
		}
		continue;
	}
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, normalize(remote));
}

if (check) {
	console.log(differences === 0 ? `schema/v1 matches ${pin.repository}@${pin.commit.slice(0, 7)}` : `${differences} file(s) differ`);
	process.exit(differences === 0 ? 0 : 1);
}
console.log(`schema/v1 written from ${pin.repository}@${pin.commit.slice(0, 7)} (${files.length} files)`);
