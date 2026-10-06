# L20-MCP: standalone server remediation

Before-edit record, 2026-10-06. Parent:
[L20-MCP](../lint-remediation-checks.md#l20-mcp).
Carver works in shared PRIMARY J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas,
HEAD 2f3687c. The parent entry links this L20 note; L19's mcp.md is preserved.
Read current AGENTS, README workflow, contributing, design/MCP data contract,
lint groups/execution plan and L20 registration. Existing node_modules reused.
Initial unrelated edits: central register, check_gifs.py, debug.log,
miro-canvas.svg, plugin-icon.ts. No worker changes outside mcp/, this note
and a standalone server eslint config; artifacts exclusively in
 tools/obsidian_cdp/.out/l20-mcp/. No production builds, nested agents, devices,
Obsidian/deploy, shared plans/locales/schema/scripts, commits or messages.

## Slice M3: traced BEFORE edits

Four inventory sites: tools-edit.ts boardOpenInObsidian's workspace path;
vault.ts PROTECTED_FOLDERS, Vault.open settings-folder check, and protected-path
error. Additional required callers: server.ts parseArguments/main -> Vault.open;
readBoardFile -> resolveExisting; BoardEdit.replaceFile re-resolves its board;
createReadTools list/read/validate -> Vault; add_card(kind file) ->
readVaultFilePath -> static splitRelativePath, which must use the active vault's
config too. Vault.listBoards currently skips hidden folders, but must also skip
an explicitly configured visible/nested directory. All metadata/source/stale
writers are reused unchanged. configDir workspace lookups must recheck directory
links, not merely lstat the final workspace file.

Local SDK evidence: node_modules/obsidian/obsidian.d.ts Vault.configDir
(lines 7328-7334) documents the public path and says the typical .obsidian may
be different. MCP cannot import/access a running Obsidian Vault; use an explicit
--config-dir argument with the literal default retained, not inferred from
network/profile state. No native private API is added. This is an authorized
runtime feature, NOT a type-only fix or a renamed literal to fool lint.

Design: validate relative config directory using existing filename/traversal
rules, allowing nested paths inside the vault; no absolute/drive/ADS/NUL/dot,
empty/device names, .trash, trailing-dot/space or link paths. Preserve default
.obsidian/.trash protection and additionally protect the selected config subtree
(case-insensitive, at component boundaries), including file-card references and
listings. Verify each configuration path component on startup/workspace access.
Store the normalized configDir on the standalone Vault; callers use instance
path checks. Workspace warnings remain warnings, not a new edit refusal.

Actions/checks: start server with default/custom/visible/nested config; list/read,
validate/edit/dry-run/undo a board; reject config/default protected paths and
file cards into them; avoid sibling-prefix false positives; reject malformed,
missing/file/link/junction config; do not follow workspace/config links; preserve
stale disk/in-memory checks, locks/review, source/unknown/BOM/native writes.
Add focused vault/edit tests, and later real-stdio integration in ignored vaults.
User-facing CLI documentation changes confined to mcp/README.md. Parent owns
shared README/changelog/release docs and real-app evidence.

## Slice M5: traced BEFORE edits

json-rpc.ts McpServer.dispatch (baseline line 126) has async with no await.
Only production caller: handleMessage awaits dispatch inside try/catch;
handleLine awaits handleMessage; serveLines awaits handleLine sequentially.
Branches initialize, notifications initialized/cancelled, ping, tools/list,
tools/call and method-not-found. Tool work is synchronous; a tool refusal is
isError content, while malformed params/method failures become RpcError replies.

Remove async while keeping the private Promise<unknown> contract: explicitly
resolve branch results and reject caught exceptions. This preserves deferred
Promise settlement and consumer error routing without an unnecessary async.
Public handleMessage/handleLine/serveLines remain async. No protocol/schema/tool
signature change. Required tests: Promise return on success/errors/notifications,
no synchronous leak, method/params/error codes, serial tool order, notification
silence, read-only tool advertisement and every output schema. This is explicit
Promise implementation work, not emitted-JS identity; no equality claim for it.

## Pending slices and coordinator gates

M1 nine imports and M2 two console redirects are required Node stdio behavior.
Before config edits, record separate runtime-rule justification and enforcement
checks. M6 filename profile adoption waits for James's pure exact contract;
no dynamic regex or src edits. If no shared profile is adopted, use an explicit
exact C0 character predicate only after recording its evidence and exhaustive
UTF-16 comparison. Type-only edits require owned module JS identity.

All worker tests are unit/throwaway-vault/process evidence, not real-app/device
input. Full typecheck/integration/plugin build/production MCP bundle and shared
inventory dispositions remain parent-owned. No claimed app/input pass.

## Slice M6: traced BEFORE adopting the supplied helper

James's src/control-characters.ts and l20-foundation-settings.md now publish
hasInvalidFilenameCharacter(value, includePathCharacters = true). It is pure,
has no imports and explicitly documents false for MCP's segment profile.
Review: false rejects exactly U+0000..U+001F and double quote/star/angle brackets/
question mark/pipe. DEL, C1, ordinary/supplementary Unicode and lone surrogates
remain allowed by this character check; colon/NUL, separators, dots/spaces,
reserved names, traversal and protected roots stay caller-owned.

Adopt hasInvalidFilenameCharacter(name, false) in Vault.pathNames, replacing
only the old /[<>"|?*\u0000-\u001f]/ test. Callers include default/custom config
validation, static/instance board/file/folder path parsing, resolveExisting,
readBoardFile and checked BoardEdit writes. Exhaustively compare original
regex and helper over all 65,536 UTF-16 units, alone and first/middle/last in
names; add C0/DEL/C1/astral/lone-surrogate examples and retain reserved/traversal/
ADS/link tests. Not type-only: byte identity is not expected; exact accept/reject
profile is required. Worker neither edits helper nor trusts its default true.

## Slice M1/M2: traced BEFORE standalone lint-config edits

M1 baseline nine imports: board-file crypto/fs/path; json-rpc readline/stream;
tools-edit fs/path; vault fs/path. All are Node-only standalone requirements,
except tools-edit path becomes unused after M3 and is removed rather than hidden.
M2 baseline two diagnostics: server.ts console.log = console.error and
console.info = console.error. Existing console.debug redirect is also retained.
Those are defensive assignments before CLI parsing, never logging calls.

Standalone mcp/eslint.config.mjs will enforce the same JS recommended and
TypeScript recommendedTypeChecked rules at error severity with project typing,
Node globals, no cache, no control-regex/eval/implied-eval, restricted imports/
globals for network and Obsidian/Electron, and local rules for stdout safety and
configuration-path ownership. No Obsidian plugin-only/mobile rule is disabled:
that plugin config remains untouched and is not loaded into the Node program.
A standalone Node server has no Platform/App/Vault SDK object. Permit exactly
console log/info/debug assignments to console.error in server.ts, rejecting
calls/computed accesses/other assignments; forbid .obsidian literals except the
explicit DEFAULT_CONFIG_DIR initializer in vault.ts. A network/Obsidian/process
module import is prohibited even via dynamic import/re-export/require; necessary
fs/crypto/path/readline/stream remain valid. No broad TypeScript/async/security
weakening, no dynamic-name escape. CLI stdout must contain only JSON responses.

Required checks: scan all mcp/src under both original diagnostic rules and new
server enforcement; record disposition of every baseline diagnostic. Negative
lint fixtures must fail for unsafe console, direct configured-path bypass,
network/Obsidian/static/dynamic/re-export/require imports, eval, floating Promise,
async-without-await and unnecessary assertion. Valid Node imports and exact
redirects pass. Repeat bounded real CLI processes against new ignored-folder
vaults; no production bundle output. Parent may add package script/root lint
routing later (proposal only, no worker package/root config mutation).

M5 implementation refinement BEFORE edit: the first explicit Promise.reject
form triggers the enforced prefer-promise-reject-errors rule for an unknown
caught value. Use a synchronous new Promise<unknown> executor: resolve known
branches, and let executor throws become rejections exactly as async dispatch
did. This retains arbitrary rejection values instead of coercing them to Error.
Test ordered consumers and Promise-return/rejection behavior below.

Lint scope refinement BEFORE config edit: retain ignoreRestSiblings:true from
the existing Obsidian lint policy for intentional object-rest omission; enforce
args:all and only ignore existing underscore adapter arguments (_clear and
_immediate), stronger than baseline args:none. No variable-ignore regex, renames,
or disabled unused rules. Existing rest destructuring discards known fields
without losing unknowns; rewriting it for lint would change runtime operations.

## L20 results and per-diagnostic disposition (2026-10-06)

Bounded MCP scope completed in the shared primary checkout at baseline 2f3687c.
M3 implements --config-dir (both spellings), validated active Vault.configDir,
protected default/active/trash subtrees, visible/nested config exclusion from
listings, guarded workspace lookup and active-vault file-card validation.
M5 retains Promise results/rejections and ordered awaited protocol consumers
using a synchronous Promise executor. M6 uses James's reviewed exact false
filename profile, preserving C0/punctuation rejection, DEL/C1 acceptance and
all separate NUL/colon/traversal/reserved-name checks. No src/schema/locales
implementation, board writers/history or user interface was changed by Carver.

Every one of the 17 baseline diagnostics has a disposition below. Lines are
from 2f3687c, not shifted current source lines.

| ID | Site | Disposition |
| --- | --- | --- |
| M1-1 | board-file.ts:18 crypto | Required SHA-256 and random temporary names; valid enforced Node runtime. |
| M1-2 | board-file.ts:19 fs | Required checked, atomic disk writes; valid enforced Node runtime. |
| M1-3 | board-file.ts:20 path | Required contained file/temporary paths; valid enforced Node runtime. |
| M1-4 | json-rpc.ts:10 readline | Required stdio newline framing; valid enforced Node runtime. |
| M1-5 | json-rpc.ts:11 stream types | Node stream protocol types; valid enforced Node runtime. |
| M1-6 | tools-edit.ts:14 fs | Required bounded workspace reads; valid enforced Node runtime. |
| M1-7 | tools-edit.ts:15 path | Removed: active Vault now resolves configuration files with link/containment guards. |
| M1-8 | vault.ts:11 fs | Required guarded disk metadata/listings; valid enforced Node runtime. |
| M1-9 | vault.ts:12 path | Required relative/absolute containment validation; valid enforced Node runtime. |
| M2-1 | server.ts:47 console.log redirect | Retained, exactly allowed by mcp-runtime/stdio; stdout contains protocol only in real processes. |
| M2-2 | server.ts:48 console.info redirect | Retained, exactly allowed by mcp-runtime/stdio, along with pre-existing debug redirect. |
| M3-1 | tools-edit.ts:172 workspace path | Replaced with guarded active configuration-file resolution. |
| M3-2 | vault.ts:25 protected folders | Active config is protected alongside .obsidian/.trash. One explicit compatible default literal remains and is exclusively allowed by config-path enforcement. |
| M3-3 | vault.ts:102 vault detection | Configured folder existence/type/links/real containment validated; non-default vaults supported. |
| M3-4 | vault.ts:139 protection/error | Instance/static selected-config checks reject whole active subtree and retain default/trash; no hardcoded-directory assumption in the message. |
| M5 | json-rpc.ts:126 dispatch async | Removed unnecessary async; explicit private Promise contract preserved and tested through public consumers. |
| M6 | vault.ts:134 control regex | Exact pure hasInvalidFilenameCharacter(name, false), exhaustive original-profile equivalence. |

Original plugin-oriented diagnostic scan: 15 warnings + 2 errors (17) ->
9 warnings + 2 errors (11). Remaining eleven are eight required Node imports,
two defensive stdout-to-stderr redirects and one explicit default config literal.
They are NOT claimed as eleven source fixes. The separately enforced Node server
config reports zero warnings/errors, with negative fixtures preventing unsafe
console/stdout, network/Obsidian/subprocess imports, config-path bypass, eval,
control regex, unnecessary assertions and Promise mistakes. No plugin/root lint
rule was changed or disabled. Server TypeScript/async/security enforcement is
recommendedTypeChecked at error severity; intentional rest omissions preserve
baseline ignoreRestSiblings and underscore adapter arguments retain arity.

## Focused verification and artifacts

All artifacts are under tools/obsidian_cdp/.out/l20-mcp/ (git-ignored). No root
.out file was created or changed by this L20 worker.

- tests-final.json/log: 183 passed, zero failed/skipped, 10 MCP test files.
  This includes 26 custom config/profile tests, 25 lint-enforcement tests and
  10 real child-process stdio cases with a 10-second process timeout.
- Actual process cases use newly created stdio-vault-* directories inside the
  ignored artifact root, with only copied schema fixtures plus sentinel fields.
  They run an artifact-only bundled executable, never mcp/dist or main.js.
  Default, visible and nested config spellings: valid JSON-RPC stdout, stderr
  startup information, reads/listing/write, workspace warning, stale refusal,
  lock refusal, traversal/protected refusal and source/unknown retention.
  Custom read-only process advertises exactly three tools and refuses edits;
  six invalid/missing config/startup cases have empty stdout and exit code 2.
- stdio-server.mjs, stdio-bundle-metafile.json and stdio-*.stdout/stderr.txt:
  actual isolated executable, graph and process evidence. Existing four boundary
  tests additionally pass in-memory builds with write:false: no plugin/session/
  Obsidian/Electron/network import and no MCP/ajv in the plugin graph.
- server-lint-final.json: enforced standalone scope, 0 errors / 0 warnings.
  plugin-rules-before/after.json and scan-before/after.log: original diagnostic
  comparisons, with no changed rule policy. scan.mjs retains reproducible setup.
- verify.mjs / verification.json: all 17 per-site dispositions, changed paths,
  UTF-8 without BOM + CRLF checks and three emitter comparisons per module.
- Eight owned module snapshots and before/after plain/minified/TypeScript JS.
  Four unchanged modules (board-file, summary, tools, validate) have identical
  source and emitted bytes in all comparisons. vault, tools-edit, server and
  json-rpc intentionally change runtime for the separately traced feature/
  Promise/profile work; no false byte-equivalence claim for those modules.
  There is no standalone type-only slice in L20. Raw JS/process proof artifacts
  retain their emitter's exact bytes; authored source/config/note uses CRLF.
- Scoped typecheck passes with tsconfig.mcp.json and typecheck-sdk-globals.log.
  Initial restricted graph omitted Obsidian's actual ambient globals required
  by the parent DOM helper (createEl/createSvg). Artifact config now loads the
  installed SDK type declarations explicitly alongside node/vitest globals,
  without changing project lib/tsconfig/source or importing SDK code at runtime.
  SDK global declarations are in obsidian.d.ts:10,192,195; configDir evidence
  is at :7328-7334. This is a scoped compile, not the parent's full-project gate.
- L20-MCP.patch: concrete patch including new config/tests/note; regenerate
  with verify.mjs after any note changes. Scoped git diff --check passed.

Commands used:

```text
node node_modules/vitest/vitest.mjs run mcp/tests --no-file-parallelism --maxWorkers 1 --no-cache --reporter=json --outputFile=tools/obsidian_cdp/.out/l20-mcp/tests-final.json
node node_modules/eslint/bin/eslint.js --config mcp/eslint.config.mjs mcp/src --format json --output-file tools/obsidian_cdp/.out/l20-mcp/server-lint-final.json
node node_modules/typescript/bin/tsc --project tools/obsidian_cdp/.out/l20-mcp/tsconfig.mcp.json --noEmit
node tools/obsidian_cdp/.out/l20-mcp/verify.mjs
```

## Exact changed paths and parent handoff

mcp/src/vault.ts; mcp/src/tools-edit.ts; mcp/src/server.ts;
mcp/src/json-rpc.ts; mcp/tests/config-directory.test.ts;
mcp/tests/json-rpc.test.ts; mcp/tests/lint-runtime.test.ts;
mcp/tests/stdio.test.ts; mcp/eslint.config.mjs; mcp/README.md;
docs/lint-workers/l20-mcp.md. No other file was written by Carver except
exclusive ignored artifacts. Shared concurrent edits were preserved.

Proposed parent package script (not applied): lint:mcp =
"eslint --config mcp/eslint.config.mjs mcp/src". Parent may add it to overall
CI/gates and update shared README/changelog/inventory. The MCP README documents
the new config option and enforced standalone runtime. New helper dependency
src/control-characters.ts is James-owned and reviewed; it must be included in
the eventual integrated patch. No additional dependency/install is needed.

Remaining parent gates: full root typecheck/unit/plugin lint/CSS/schema/smoke;
production MCP/plugin build and final bundle/dependency validation on a fixed
integrated revision; required real Obsidian/physical input and shared release/
plan/inventory/docs accounting. No full integration/real-app/device pass is
claimed here, and no deploy/production output/commit/push/message was performed.
Runtime risk is limited to the documented new config selection and explicit
Promise implementation; tests cover defaults and refusal/success branches.
Configuration symlink/time-of-use and atomic-write race windows retain the
existing disk-file trust model; no claim of race-free filesystem transactions.
