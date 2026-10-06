# L20 FOUNDATION-SETTINGS (James)

## Scope and before-edit helper trace (2026-10-06)

Shared primary J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas, baseline
2f3687c861cb4c33afc5fcd3ac0a562662214a26. Coordinator's prior
[L20 entry](../lint-remediation-checks.md#l20-foundation-settings) links this
note (l20-foundation-settings.md); use that exact linked file. Reuse existing
node_modules; do not modify shared register/plans/locales/budgets, main.js or
other outputs. Artifact root exclusively tools/obsidian_cdp/.out/l20-foundation-settings.
Owned implementation: appearance.ts, control-characters.ts, settings-tab.ts;
focused tests only. No other callers/worker files, deployment, devices or commit.

Slice H-CONTROL, BEFORE source edits: implement a standalone pure string module
(no imports) exporting the following minimal shared API. Existing profiles and
callers are traced in ../lint-workers/foundation.md: S3 keys/names/subpaths,
attachment name CONTROL_OR_FORMAT, filename sanitizers and SAFE_CUSTOM_FONT_FILE,
and M6 Vault.splitRelativePath. This slice introduces the contract and tests only;
other workers adopt it after review, without this worker editing their modules.

- hasAsciiControl(value: string, includeDelete = true): C0 U+0000-U+001F;
  optionally DEL U+007F; never C1. No trim, coercion or normalization.
- hasControlOrFormat(value: string): attachment-labels' exact set: C0,
  U+007F-U+009F, U+2028/U+2029, U+200B/U+200C/U+200E/U+200F,
  U+202A-U+202E, U+2060-U+2064, U+2066-U+2069, U+FEFF.
  U+200D/U+2065 stay allowed.
- hasInvalidFilenameCharacter(value: string, includePathCharacters = true):
  C0 and double quote, star, <, >, ?, pipe; optional /, backslash, colon.
  false selects M6's exact segment set; traversal/ADS/separators/reserved names
  remain caller checks. DEL/C1 are not included.
- replaceInvalidFilenameCharacters(value: string, replacement = "_"):
  replace each full filename-profile match once, retain all other code units.
  Leading-dot handling, trim, fallback and length remain caller operations.
- hasValidFilenameCharacters(value: string, maxCodePoints = 180): same full
  filename set, nonempty, bound Unicode code points as historical /u {1,180},
  counting a valid surrogate pair once and lone surrogates individually.
  This is only character/length validation, not a full safe-path decision.

Use charCodeAt numeric loops, no dynamic regex workaround. Tests compare exact
historical profiles on all 65,536 UTF-16 units alone and at first/middle/last
positions, plus mixed Unicode/surrogate/whitespace strings, replacement bytes,
C0/DEL/C1 and each format-boundary near miss. Cover 180/181 astral codepoints,
empty input and punctuation; retain caller-owned trim and reserved-name policies.
Run focused helper tests and complete targeted lint (no disabled rules).
No runtime profile broadening. Parent owns all app/Android QA.

Next slices need separate before-edit trace here: F-RECORDS1 (cloneUnknown's
prototype annotation, byte-identical module), F-VALID2 (two appearance validators,
exact profile equivalence), then coherent settings definitions/search/custom host
and persistence based on installed SDK plus actual local native implementation.

## F-RECORDS1 before-edit trace

appearance.ts cloneUnknown:385 reads Object.getPrototypeOf(value) after rejecting
nonobjects, loops/cycles, and validating array length/own numeric indices. The
prototype result is compared with null/Object.prototype; other prototypes and
getters/Proxy faults return INVALID. copyUnknownProperties and appearance
normalization/merge retain supported JSON unknown fields, called by M1 appearance
transactions, imported metadata and appearance-metadata exports. Actions include
font/color/reset, reopen/import and plugin-owned metadata writes.

Change only `const prototype: unknown = Object.getPrototypeOf(value);`.
Preserve the exact operation/order and public declarations. Mandatory: esbuild
plain/minified and TypeScript module JS before/after, focused appearance/metadata
immutability/source/unknown/prototype/cycle/revoked-Proxy tests, targeted lint
(no new warning). Save intermediate appearance.records.ts for proof before the
separate validation slice. Native/Android appearance/history remains parent QA.

## F-VALID2 before-edit trace

appearance.ts isSafeObjectKey:316 rejects C0/DEL after trim, nonempty/256-unit
limit and case-insensitive reserved keys. isSafeLabel:327 rejects C0/DEL and < >
after trim/nonempty/80-unit limit. Used by own-key clone/normalize/merge, palette
ID/label normalization/validation, appearance reducers and lookup. Retain exact
trim scope: an outer tab/newline may be trimmed for appearance, unlike some other
callers. C1 stays allowed. Use reviewed helper hasAsciiControl on existing key/
label strings; separate label.includes("<")/includes(">") clauses. No other
callers or paths change. Runtime repair is authorized but must be equivalent.

Mandatory: helper exhaustive profiles, old/current public appearance validator
comparison for all 65,536 units at first/middle/last and alone, reserved/case/
trim/256-257 keys, 80-81 labels, Unicode/lone surrogates, returned diagnostic
paths/values and unchanged inputs. Appearance, metadata/writer/store unit tests;
new focused prototype/cycle/hostile JSON tests; targeted lint zero appearance
warnings. F-RECORDS1 intermediate already proves exact plain/minified/TypeScript
JS and declaration identity (records-proof.json). Final appearance validator JS
is intentionally different; equivalence tests, not type-only identity, apply.
Parent owns real appearance action/reset/undo/reopen/native/Android checks.

## S6 settings before-edit trace (five baseline diagnostics)

settings-tab.ts baseline sites: class at 59 lacks getSettingDefinitions;
font remove setWarning at 290; redisplayInPlace calls display at 459 (prefer-
update and deprecated); slider setDynamicTooltip at 516. Read SDK declarations
PluginSettingTab/SettingTab, SettingDefinitionRender/Group, ButtonComponent and
SliderComponent, plus locally extracted app.js from installed 1.13.7 and 1.14.4.
Exact bytes/excerpts live in this worker artifact root; no app is launched.

Native facts (1.13.7 offsets): SettingTab.getSettingDefinitions/update at 2742495:
update assigns settingItems, validates names, refreshes search and current page;
renderTab uses definitions when nonempty and bypasses display. Native s6 invokes
per-row render after setting its name/desc; n6 reconciles rows by names/positions,
clears old custom components and attempts native focus restoration. Native search
index (Mie/Sie at 3779612) recursively indexes visible/searchable definition names,
descriptions and aliases. SettingTab defaults use vault config; PluginSettingTab
defaults use plugin.settings/saveData. These defaults are unsuitable for this
plugin's settingsOfThisDevice/saveCanvasSettings host. Button.setWarning is exactly
setDestructive().setCta(); deprecated slider tooltip is a no-op (value inline).
SDK marks definitions/update/destructive APIs since 1.13.0. Actual supported
1.13.8 input remains parent QA; 1.12.7 is below manifest min, not certification.

Callers/actions: main constructs MiroCanvasSettingTab with device-specific getter,
saveCanvasSettings, current comment authors/account, welcome/import, update check,
font download/removal/custom-font/font-pool actions. Native addSettingTab/update
indexes definitions before the tab opens; avoid DOM/control/font-loading/network
side effects in definition construction. Current private methods render 12 sections:
getting-started/navigation/panning/connectors/drawing/keyboard/interface/tools/
comments/fonts/updates/advanced. All controls must remain available, searchable
in EN/RU using existing words, and continue saving only through SettingsTabHost.
Download/update/file picker/welcome/import actions must stay press-only.

Implementation plan: private SettingsRow builder records the existing native
Setting configuration without creating DOM during definition collection. Emit
real per-row SettingDefinitionRender entries with matching name/desc and render
callbacks, not fake search-only entries or one opaque tab definition. Group each
existing section separately to avoid duplicate names across authors/fonts/tools;
render original headings/attributes and per-row controls through native Setting.
Keep a first section-navigation definition; collect its labels before rendering,
then focus actual heading and scroll in the owning container on selection. No
new DOM factory. getSettingDefinitions replaces display entirely for supported
1.13+; don't retain a bypassed deprecated display to hide a warning. All callbacks
continue custom host persistence, so native default bindings cannot hit vault
config/plugin.saveData. Lists regenerate via update, preserving scroll explicitly
and relying on observed native row/focus reconciliation. Dynamic author colors,
font packs/custom/pool and toolbar order derive from latest host state on update.
Direct status/row-element access moves into render callbacks. wantFonts runs on
pool-row render, not initial search indexing. setWarning becomes the native
byte-equivalent setDestructive().setCta(); remove tooltip no-op, retain existing
inline slider display and formatted description. No locale/schema changes.

Mandatory focused tests: definitions contain all original headings/controls;
EN/RU searchable names/descriptions, dynamic authors/fonts/tool lists and unique
native keys by section. Collecting/indexing definitions makes zero save/network/
file/font-loading calls. Render/event smoke on a synthetic native Setting host:
scalar toggle/dropdown/slider/text values and bounds; font remove/update/custom
callbacks and statuses; toolbar reorder/toggle/reset, color reset and readonly
host getter freshness, section selector scroll/focus, scroll on update and same
row names, no direct plugin/saveData/vault-config writes. Native implementation
inspection is read-only evidence, synthetic tests are not real-app input. Run
focused settings+appearance+helper+metadata tests, TypeScript and targeted full
lint rules. Parent handles both themes, supported 1.13.8 native search, keyboard/
focus/scroll and device-local persistence/restore on devices.

### Settings search refinement before final source follow-up

Initial native-row facade tests pass, and old/current initial row/control snapshots
match in EN/RU for defaults and dynamic settings (75/76 rows). Search must also
find the two existing nameless button rows: Add custom font and Reset toolbar.
Before this follow-up edit, record aliases from those existing button labels;
also include a custom font's existing family value with its filename definition.
These are native SettingDefinitionBase.aliases (SDK/native Mie evidence above),
metadata only, no visible strings/controls or locales added. Test EN/RU indexing
of these aliases. Builder callbacks explicitly discard native Setting's thenable
return by statement blocks; do not return it from a void render step. No promise
behavior changes. Final button block indentation is corrected in this same slice.

## Completion evidence and handoff (2026-10-06)

Bounded source scope completed: appearance.ts F-RECORDS1/F-VALID2;
control-characters.ts shared contract (explicitly reviewed/accepted by parent,
who independently reran the four helper tests); settings-tab.ts five diagnostics.
No adopting caller beyond appearance was edited here. The parent DOM factory is
consumed transitively by existing toolbar icon code; no DOM factory was written
or altered by this worker.

Targeted complete lint: baseline appearance 3 + settings-tab 5 = 8 warnings,
zero errors. Current appearance/control-characters/settings-tab: zero warnings
and zero errors. No rule/config disable, dynamic control-regex workaround or
new warning. The intermediate builder's thenable-return diagnostics were fixed
with explicit void statement callbacks. All baseline rules remain enabled.

F-RECORDS1 proof: appearance's unknown prototype annotation has byte-identical
ES2020 ESM plain/minified esbuild and TypeScript JS, plus identical declarations.
Exact module SHA-256 values in records-proof.json are 47591d... (plain), 6bb1cf...
(minified), a13c4a... (TypeScript). The later two validator replacements are
runtime code changes and are proved equivalent, not called byte-identical.

Validator proof compares actual bundled baseline/current public appearance
validators' complete returned JSON for every UTF-16 code unit alone/first/middle/
last, plus 20 reserved/trim/length/Unicode cases: 524,328 comparisons, all identical.
The helper's tests compare seven historical predicate/replacement results on
262,144 positioned single-unit strings, mixed pairs, astral/lone surrogates and
180/181 code-point font filename limits. No changes to C0/DEL/C1/format profiles.

Final focused run: 152 tests passed in 7 files (appearance 38, metadata 16,
MetadataWriter 15, Obsidian metadata store 18, settings 52, helper 4, settings tab 9).
Appearance adds two prototype/unknown/cycle/hostile-record cases; new helper and
settings-tab suites cover exhaustive profiles, EN/RU definitions/search aliases,
custom-host scalar save, bounds, toolbar reorder/reset/hidden controls, current
font/author state, destructive button styling, font progress failure, custom font
and pool actions, section scroll/focus, and press-only actions. Definitions are
collected without save/network/file/font-load calls. Focused TypeScript program
(owned modules/tests plus imported dependencies) has zero diagnostics. An earlier
whole-type probe observed an unrelated concurrent board-selection-extensions test
error; it was not edited here, and full integration types are parent-owned.

Initial UI snapshot proof: original imperative tab versus current definitions
rendered through the synthetic native Setting facade matches row names, descriptions,
headings, attributes/classes, control kinds/values/options/tooltips/bounds/disabled/
destructive state in four cases: EN/RU, default (75 rows) and populated settings
(76 rows). Native group wrapper layout is deliberately outside that synthetic
snapshot proof and must be assessed by parent native input/visual checks. Existing
settings CSS and check-settings-navigation selectors use descendants and retain
the same classes/attributes. All 12 original sections remain; native groups
isolate same-named author/font rows. The first selector scrolls/focuses the original
heading semantics. Updates reindex all definitions and preserve scrollTop.

The tab is declarative on supported Obsidian 1.13+; no deprecated display override
or call remains. No native default config binding is used: every value/action
still goes to the same SettingsTabHost device-specific persistence callback.
Native facts were read from local app.js 1.13.7 and 1.14.4, with SDK declarations
marking the APIs since 1.13.0. Real 1.13.8 settings search/focus/keyboard and both
themes remain pending parent checks. The legacy 1.12.7 phone is below manifest
minimum and lacks this declarative settings API; no legacy settings rendering
compatibility claim is made by this patch. If parent requires that unsupported
fallback, it needs a separate explicitly scoped compatibility slice/native source
trace; it is not silently implemented by disguising a deprecated display method.

No locale, central register/plan, inventory, style budget, production build,
board/vault, main.js, device/deployment, commit/push or other worker file writes.
The four unrelated root files remain untouched. CRLF/strict UTF-8 checks and scoped
patch verification are recorded in final-proof.json. All proof files are confined
to tools/obsidian_cdp/.out/l20-foundation-settings; root .out was not written.

Evidence/reproduction (all relative to this exclusive artifact directory):
- lint.before.json / lint.after.json: exact full-rule diagnostic delta.
- records-proof.mjs / records-proof.json / appearance.records.ts: type-only bytes.
- validator-proof.mjs / validator-proof.json: returned-result differential test.
- settings-ui-proof.mjs / settings-ui-proof.json: initial synthetic UI snapshots.
- focused-tests.json / focused-tests.log: final 152-pass run.
- focused-types.mjs / focused-types.json / focused-types.log: owned compiler roots.
- read-native.py / native-1.13.7-excerpts.json / native-1.14.4-excerpts.json and
  extracted app.js: read-only native implementation locators, no live-app input.
- appearance.before.ts / settings-tab.before.ts: baseline source snapshots.
- final-proof.mjs / final-proof.json / owned.patch: scoped hashes/encoding/lint/patch.

Pending parent: full repository types/tests/lint/CSS/schema/build/smokes/oracle,
integrated plugin/MCP consumers of the reviewed helper, supported desktop/tablet
settings search and keyboard focus/reconciliation, native group/layout sizing,
device-local persistence/external-change/restore, font/author/toolbar actions and
normal appearance history/locks/source/unknown preservation in actual Obsidian.
No real-app/Android input is certified by these unit/module/synthetic results.
