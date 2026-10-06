# L19-MCP: six redundant assertions (before implementation)

Recorded 2026-10-06 before implementation edits. Parent registration:
[L19-MCP](../lint-remediation-checks.md#l19-mcp-server-executor--six-redundant-assertions).
Worker: mcp. Work directory: J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas,
shared primary checkout, HEAD 85cb6cd. L19 is already present; the shared
register is coordinator-owned and will not be edited by this worker.

Exclusive source scope: mcp/src/board-file.ts and mcp/src/tools-edit.ts.
Optional focused coverage only in existing mcp/tests files. This note and
tools/obsidian_cdp/.out/l19-worker-artifacts/mcp/ proof files are worker-owned. Initial unrelated changes: shared
register, check_gifs.py, debug.log, miro-canvas.svg, plugin-icon.ts.
Read AGENTS.md, README workflow, contributing guide, design/data-contract/MCP
notes, lint groups, M4 inventory, and L19-MCP. Existing node_modules is reused:
reinstalling dependencies during parallel edits would disturb other workers.

## Exact sites and callers traced before edits

Line numbers refer to baseline 85cb6cd; six M4 inventory entries only.

| Site | Data/caller path and justification | Agent/user action and mandatory checks |
| --- | --- | --- |
| board-file.ts:337, FileMetadataStore.commitDocument: structuredClone(nextDocument) as Record<string, unknown> | EditSession.writer creates MetadataWriter over FileMetadataStore; MetadataWriter.commitSnapshot and rollback commit call this store. It compares savedDocument with expectedDocument via sameJson before BoardEdit.save, which rechecks disk revision and clones the accepted document. structuredClone preserves the Readonly record shape accepted by save. Remove only the assertion. | Any metadata edit (lock, comments, independent lines); require in-memory expected-document rejection, disk-stale rejection, no write/temporary leftovers after refusal, exact source/unknown fields and BOM preservation. |
| tools-edit.ts:858, setStyle input.connector assertion | createServerTools -> createEditTools -> set_style -> runEdit -> CanvasAuthoring.updateElementStyles -> FileCanvasRuntime checked save. isRecord narrows args.connector to UnknownRecord; LocalConnectorSettings consists of optional settings accepted by the receiver. Schema and authoring validation stay intact. | Restyle native edges; require route/color/width/caps, retained unspecified fields, locked/review refusals, unchanged source/unknowns and dry-run/undo. |
| tools-edit.ts:978, lock writer callback return next as UnknownRecord | lock validates every id in native nodes/edges or board connectors; reduceInteractionMetadata returns InteractionMetadata or undefined. Existing undefined rejection narrows next to the record consumed by MetadataWriter.write. No cloning/validation/ordering changes. | Lock and unlock cards/lines; require known-id success, missing-id refusal, blocked later edits and metadata/source/unknown preservation. |
| tools-edit.ts:1042, connectorPatch (args[key] as string).toLowerCase() | update_connector -> updateLine -> connectorPatch; typeof args[key] === string already narrows the indexed value. Keep parentheses so transform output remains identical, and retain all property reads and lowercase conversion. | Change native/independent line color and style; require uppercase color normalization, omitted fields unchanged, both storage forms validated and locks/review respected. |
| tools-edit.ts:1044, connectorPatch return patch as Partial<BoardConnector> | Same caller; Record<string, unknown> is accepted as Partial<BoardConnector>. Native branch supplies the patch to updateElementStyles; independent branch calls restyleBoardConnector, readBoardConnector, fitsNativeEdge and writeBoardConnectors/connectorToNative. Keep return type and every validation step. | Restyle a connector, convert it to a native edge when both ends are cards; require same id, native geometry/override writing, no invalid or locked write, source/unknown preservation. |
| tools-edit.ts:1092, updateLine next = rest as BoardConnector | Independent connector branch starts with a spread copy of current BoardConnector. Removing optional label by object rest keeps every required field and unknown field. Existing readBoardConnector validation, editAllowed, fitsNativeEdge and writer paths remain unchanged. | Clear independent connector label with empty string; require label absence, unchanged endpoints/style/unknowns/source, valid board, no-op repeated clear and locked/review refusal. |

createServerTools is called by server.ts main; readOnly exposes only read tools.
McpServer/serveLines serialize answers over newline JSON-RPC. Node imports,
server console redirects, .obsidian workspace/config guards, dispatch Promise
contract and filename regex are outside this batch. Public signatures and
schemas remain unchanged. This is server-only type erasure; no Android/UI
runtime path changes are authorized.

## Required proof and regression checks (pending before edits)

- Save exact before sources to tools/obsidian_cdp/.out/l19-worker-artifacts/mcp/. Use esbuild.transform with loader ts,
  ESM and Node 20 target on each owned module before/current; require identical
  emitted JavaScript bytes and SHA-256, without bundling or production outputs.
- Targeted ESLint over just the two modules with the same recommended rules,
  TypeScript warning policy and Node globals used for the MCP inventory;
  no rule disabling, cache or shared report. Require exactly six M4 removals,
  unchanged M1/M3 diagnostics and no new diagnostics.
- Focused existing board-file, edit-tools, read-tools and json-rpc tests:
  metadata expected-document and stale guards; locked/review and missing ids;
  graph/native edge and independent connectors; source/unknowns/BOM; revision,
  dry-run and exact-byte undo; read-only advertisement; JSON-RPC ordering,
  parseability, schemas and refusals. Add focused assertions for uncovered
  affected branches only, before reporting those checks as covered.
- Scoped git diff --check, inspect patch and UTF-8/CRLF; no other source edits.

Evidence classification: tests are unit/temporary-vault/protocol-stream
checks, not real Obsidian input. Clean protocol-stream tests do not prove the
CLI console redirection at process startup. Coordinator owns full typecheck,
all-unit/integration gates, full MCP bundle identity, plugin build isolation,
CLI stdout, schema, real Obsidian/physical-device checks and shared inventory.
Those gates remain pending; this worker will not build main.js or mcp/dist,
start Obsidian/devices, commit or push.

## L19-MCP results (2026-10-06)

Completed in the primary shared checkout stated above. Exactly one assertion
removed in board-file.ts and five in tools-edit.ts, at the six baseline lines
listed above. No import, config path, dispatch, console, regex, public type,
writer guard, property read, copy or runtime operation changed. Parentheses
around the narrowed indexed color remain to keep emitted JavaScript identical.
Other assertions outside the six inventoried sites remain unchanged.

Changed tracked source/test paths:
- mcp/src/board-file.ts
- mcp/src/tools-edit.ts
- mcp/tests/edit-tools.test.ts

This new worker note is docs/lint-workers/mcp.md. No shared register/inventory,
README, changelog, build output or other worker file was written.

Proof artifacts live exclusively under tools/obsidian_cdp/.out/l19-worker-artifacts/mcp/:
- proof.mjs: repeatable module transform and targeted ESLint, before/after.
- board-file.before.ts, tools-edit.before.ts: exact pre-edit source bytes.
- board-file.before.js / board-file.after.js: identical, 7,857 bytes; SHA-256
  a45829230f7608113b92eb02636aee5f56944527a7041ac598b06af1db341978.
- tools-edit.before.js / tools-edit.after.js: identical, 43,902 bytes; SHA-256
  da41a2d958123df39a2da430dea81285b3b9cfc274e7c0f2dda6fe22ea443fad.
- lint-before.json / lint-after.json and summary-before.json / summary-after.json.
  board-file warnings 4 -> 3; tools-edit 8 -> 3; errors 0 -> 0. Six M4 warnings
  removed, all remaining diagnostic objects identical (five Node-import and
  one .obsidian warnings). No lint settings changed; ESLint cache disabled.
- tests-baseline.json/log: 56 passed before source/test edits.
- tests-after.json/log: 60 passed, zero failures, four focused MCP test files.
- finalize.mjs / verification.json: six-site lint delta, preserved diagnostic
  objects, passing tests, and strict UTF-8/CRLF verification on owned files.
- L19-MCP.patch: concrete source/test/note patch; regenerate with finalize.mjs.

Focused command (no cache, one worker, no production build):

```text
node node_modules/vitest/vitest.mjs run mcp/tests/board-file.test.ts mcp/tests/edit-tools.test.ts mcp/tests/read-tools.test.ts mcp/tests/json-rpc.test.ts --no-file-parallelism --maxWorkers 1 --no-cache --reporter=json --outputFile=tools/obsidian_cdp/.out/l19-worker-artifacts/mcp/tests-after.json
```

Four added test cases cover native edge restyling with unchanged ends/source,
independent connector label removal and uppercase color normalization with
unknown connector fields retained, repeated clear as an unwritten no-op, and
native/independent line refusal under locks and review mode with byte-identical
files and no temporary leftovers. Existing cases cover stale in-memory/disk
commits, source/unknown fields at each fixture level, graph/conversion writes,
read-only tools, dry runs/undo, JSON-RPC stream parseability/order/refusals and
output schemas. All are unit/temporary-vault/stream evidence.

Scoped git diff --check passed. Source, focused test and note retain UTF-8
without BOM and CRLF. Emitted JS proof files retain esbuild's exact raw output
bytes so their identity can be independently checked.

Pending coordinator checks: full typecheck and unit/integration gates; full
MCP bundle identity against baseline and plugin/MCP separation; CLI startup
stdout/console redirection; schema checks; real Obsidian vault/input and any
required physical devices. No worker claim is made for those checks. Residual
M1/M3 warnings are intentionally outside this batch; custom config support is
still the queued semantic change. Module byte identity establishes no runtime
change in these two modules; integrated build identity remains unverified
while other workers edit shared pure modules. No blockers, commits or pushes.
