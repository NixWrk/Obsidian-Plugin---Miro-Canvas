import { beforeAll, describe, expect, it } from "vitest";
import { buildSync } from "esbuild";
import { spawnSync } from "node:child_process";
import {
  CANVAS_SNIPPET_SCOPE_ATTRIBUTE, excludeCanvasSnippetSelector, planCanvasSnippetRules,
  readNativeSnippetEntries, readNativeSnippetNames,
} from "../src/canvas-snippets";

const scope = '[data-miro-canvas-snippet-scope="7"]';
const guard = `:where(:not(${scope}, ${scope} *))`;

describe("snippet selector serialization", () => {
  it.each([
    [".content", `.content${guard}`],
    ["body .content:hover", `body .content:hover${guard}`],
    ["#note::before", `#note${guard}::before`],
    [".content:after", `.content${guard}:after`],
    ["::selection", `${guard}::selection`],
    [".note, .card::marker", `.note${guard}, .card${guard}::marker`],
    [':is(.a, #b):not([data-x="a,b"])', `:is(.a, #b):not([data-x="a,b"])${guard}`],
    ["& > .child", `& > .child${guard}`],
    ["&", `&${guard}`],
    [String.raw`.a\,b`, String.raw`.a\,b${guard}`],
    [String.raw`.a\ `, String.raw`.a\ ${guard}`],
    [String.raw`.\31 a`, String.raw`.\31 a${guard}`],
    [".parent > ::before", `.parent > ${guard}::before`],
  ])("preserves the subject and specificity of %s", (input, output) => {
    expect(excludeCanvasSnippetSelector(input, scope)).toBe(output);
  });
  it.each(["", ".a,", ".a >", ".a::before .b", ":is(.a::before)", "::view-transition", "::slotted(.x)", ".a/*x*/.b", ".a[", ".a || .b", ".a\\"])("refuses unsupported shape %s", selector => {
    expect(() => excludeCanvasSnippetSelector(selector, scope)).toThrow();
  });
  it("does not accept caller-injected scope selectors", () => {
    expect(() => excludeCanvasSnippetSelector(".a", 'body, *')).toThrow();
  });
  it("plans groups and nesting without changing native declarations", () => {
    const child = { type: 1, selectorText: "& .child::before", style: { cssText: "color:red!important" }, cssRules: [] };
    const nestedDeclaration = { type: 0, cssText: "color: blue;", style: {} };
    const parent = { type: 1, selectorText: ".parent", cssRules: [child, nestedDeclaration] };
    const rules = [{ type: 4, cssText: "@media (min-width:0px) {}", cssRules: [parent] }];
    const plan = planCanvasSnippetRules(rules as unknown as CSSRuleList, scope);
    expect(plan.map(edit => edit.replacement)).toEqual([`.parent${guard}`, `& .child${guard}::before`]);
    expect(child.style.cssText).toBe("color:red!important");
    expect(parent.selectorText).toBe(".parent");
  });
  it("rejects a whole plan before mutations when a global rule cannot be isolated", () => {
    const rule = { type: 1, selectorText: ".note" };
    const rules = [rule, { type: 7, cssText: "@keyframes collide {}", cssRules: [] }];
    expect(() => planCanvasSnippetRules(rules as unknown as CSSRuleList, scope)).toThrow("Unsupported snippet rule");
    expect(rule.selectorText).toBe(".note");
  });
});

class NativeStyle {
  constructor(readonly ownerDocument: Document) {}
}
const nativeDocument = { defaultView: { HTMLStyleElement: NativeStyle } } as unknown as Document;
const first = new NativeStyle(nativeDocument);
const second = new NativeStyle(nativeDocument);

describe("verified native readers", () => {
  it("uses installed order, never Set insertion order", () => {
    const native = { snippets: ["first", "off", "second"], enabledSnippets: new Set(["second", "first"]), extraStyleEls: [first, second] };
    expect(readNativeSnippetEntries(native, nativeDocument)).toEqual([{ name: "first", element: first }, { name: "second", element: second }]);
    const names = readNativeSnippetNames(native);
    expect(names).toEqual(["first", "off", "second"]);
    expect(names).not.toBe(native.snippets);
    expect([...native.enabledSnippets]).toEqual(["second", "first"]);
  });
  it.each([
    null, {}, { snippets: ["x", "x"] }, { snippets: ["x"], enabledSnippets: ["x"], extraStyleEls: [first] },
    { snippets: ["x"], enabledSnippets: new Set(["unknown"]), extraStyleEls: [first] },
    { snippets: ["x"], enabledSnippets: new Set(["x"]), extraStyleEls: [] },
    { snippets: ["x", "y"], enabledSnippets: new Set(["x", "y"]), extraStyleEls: [first, first] },
    { snippets: ["x"], enabledSnippets: new Set(["x"]), extraStyleEls: [{}] },
    { snippets: ["x"], enabledSnippets: new Set(["x"]), extraStyleEls: [new NativeStyle({} as Document)] },
  ])("refuses invalid entries without guessing: %j", native => {
    expect(readNativeSnippetEntries(native, nativeDocument)).toBeUndefined();
  });
  it("refuses throwing private getters", () => {
    const native = Object.defineProperty({}, "snippets", { get: () => { throw new Error("private shape"); } });
    expect(readNativeSnippetNames(native)).toBeUndefined();
    expect(readNativeSnippetEntries(native, nativeDocument)).toBeUndefined();
  });
  it("accepts an empty enabled list", () => {
    expect(readNativeSnippetEntries({ snippets: ["off"], enabledSnippets: new Set(), extraStyleEls: [] }, nativeDocument)).toEqual([]);
  });
  it("exports the agreed board-root marker", () => {
    expect(CANVAS_SNIPPET_SCOPE_ATTRIBUTE).toBe("data-miro-canvas-snippet-scope");
  });
});

const pythonBrowser = String.raw`
import json, sys
from playwright.sync_api import sync_playwright
payload = json.load(sys.stdin)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.set_content('<!doctype html><html><head></head><body></body></html>')
    page.add_script_tag(content=payload['bundle'])
    result = page.evaluate(payload['test'])
    print(json.dumps({'browser': browser.version, 'checks': result}))
    browser.close()
`;

const browserTest = String.raw`async () => {
  const { CanvasSnippetManager, readNativeSnippetEntries, CANVAS_SNIPPET_SCOPE_ATTRIBUTE: marker } = SnippetAPI;
  const checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const style = (text, doc = document) => {
    const el = doc.createElement('style'); el.textContent = text; doc.head.appendChild(el); return el;
  };
  const theme = style('body {font-family:sans-serif;text-indent:0px;--size:11px;--derived:calc(var(--size) * 2);}.variable {font-size:var(--derived);} .content {color:rgb(10,20,30); background-color:rgb(40,50,60);} .control {border-top-width:2px;border-top-style:solid;} .pseudo::before {content:"theme";color:rgb(8,9,10);} .specific {color:rgb(4,5,6);} .parent .nested {letter-spacing:0px;}');
  const blockedText = 'body {font-family:monospace!important;text-indent:32px!important;word-spacing:7px;fill:purple;--size:30px;--only:red;} .content {color:red!important;} .control {border-top-width:9px!important;} @media (min-width:0px) { @supports (color:red) {.pseudo::before {content:"snippet"!important;color:red!important;}}} .specific {color:blue;} .parent { & > .nested {letter-spacing:4px!important;} text-decoration-color:purple!important; }';
  let blocked = style(blockedText);
  const permitted = style('.content {background-color:rgb(0,128,0)!important;}');
  // Equal specificity: the native theme appended later must still win outside.
  const later = style('.specific {color:rgb(4,5,6);}');
  let entries = [{name:'blocked',element:blocked},{name:'permitted',element:permitted}];
  const diagnostics = [];
  const native = {snippets:['blocked','permitted'], enabledSnippets:new Set(['permitted','blocked']), get extraStyleEls() {return entries.map(e=>e.element);}};
  const manager = new CanvasSnippetManager(doc => readNativeSnippetEntries(native, doc), [], d => diagnostics.push(d));
  const root = () => {
    const r = document.createElement('section');
    r.innerHTML = '<div class="content">text</div><div class="variable">variable</div><button class="control">control</button><div class="pseudo"></div><div class="specific"></div><div class="parent"><div class="nested"></div></div>';
    document.body.appendChild(r); return r;
  };
  const note = root(); const a = root(); const b = root();
  a.setAttribute(marker, 'prior');
  a.style.setProperty('text-indent','inherit');
  const computed = el => getComputedStyle(el);
  const capture = r => [computed(r).fontFamily, computed(r).textIndent, computed(r).getPropertyValue('--size'), computed(r).getPropertyValue('--only'), computed(r.querySelector('.content')).color, computed(r.querySelector('.content')).backgroundColor, computed(r.querySelector('.control')).borderTopWidth, getComputedStyle(r.querySelector('.pseudo'),'::before').content, computed(r.querySelector('.specific')).color, computed(r.querySelector('.nested')).letterSpacing, computed(r.querySelector('.variable')).fontSize, computed(r).wordSpacing, computed(r).fill, computed(r.querySelector('.parent')).textDecorationColor];
  const originalNote = capture(note);
  check(originalNote[13] === 'rgb(128, 0, 128)', 'nested-declaration fixture was not parsed by browser');
  const originalSelectors = Array.from(blocked.sheet.cssRules).map(r => r.cssText);
  const nativeDeclarations = blocked.sheet.cssRules[1].style.cssText;
  const removeA = manager.register(a); const removeB = manager.register(b);
  check(JSON.stringify(capture(note)) === JSON.stringify(originalNote), 'ordinary note changed');
  for (const r of [a,b]) {
    const c = capture(r);
    check(c[0] === 'sans-serif' && c[1] === '0px' && c[2] === '11px' && c[3] === '' && c[10] === '22px' && c[11] === '0px' && c[12] === 'rgb(0, 0, 0)', 'inherited font/indent/custom variables not isolated: '+JSON.stringify(c));
    check(c[4] === 'rgb(10, 20, 30)' && c[5] === 'rgb(40, 50, 60)' && c[6] === '2px' && c[7] === '"theme"' && c[9] === 'normal' && c[13] === 'rgb(0, 0, 0)', 'content/control/important/pseudo/media/nesting not isolated: '+JSON.stringify(c));
  }
  check(blocked.textContent === blockedText && blocked.sheet.disabled === false, 'native text or disable state changed');
  check(blocked.sheet.cssRules[1].style.cssText === nativeDeclarations, 'native important declaration changed');
  checks.push('default/two-roots/note/specificity/pseudo/media/supports/nesting/important/inheritance');
  const selectors = list => Array.from(list).flatMap(rule => [
    ...(typeof rule.selectorText === 'string' ? [rule.selectorText] : []),
    ...('cssRules' in rule ? selectors(rule.cssRules) : []),
  ]);
  const singleGuard = () => check(selectors(blocked.sheet.cssRules).every(selector => (selector.match(/:where\(:not\(\[data-miro-canvas-snippet-scope=/g) ?? []).length === 1), 'repeated refresh accumulated Canvas exclusion guards');
  for (let cycle = 0; cycle < 25; cycle++) {
    manager.refresh(document); manager.refresh(); singleGuard();
    manager.configure(['blocked']); manager.refresh(document);
    check(Array.from(blocked.sheet.cssRules).map(r=>r.cssText).join('\n') === originalSelectors.join('\n'), 'repeated native CSSOM opt-in did not restore exact originals');
    check(computed(a).textIndent === '32px' && computed(b).fontFamily === 'monospace' && computed(b).getPropertyValue('--size') === '30px', 'repeated opt-in kept inherited baseline overrides');
    manager.configure([]); singleGuard();
    check(computed(a).textIndent === '0px' && computed(b).fontFamily === 'sans-serif' && computed(b).getPropertyValue('--size') === '11px', 'repeated opt-out missed inherited values');
    check(JSON.stringify(capture(note)) === JSON.stringify(originalNote), 'repeated refresh changed ordinary note');
  }
  checks.push('repeated-real-cssom-refresh-opt-in-opt-out');
  manager.configure(['blocked']);
  check(computed(a).fontFamily === 'monospace' && computed(a).textIndent === '32px' && computed(a).getPropertyValue('--size') === '30px', 'allowing body snippet did not remove inherited overrides');
  check(Array.from(blocked.sheet.cssRules).map(r=>r.cssText).join('\n') === originalSelectors.join('\n'), 'allowing snippet did not restore exact original selectors/grouping');
  manager.configure(['permitted']);
  check(computed(a.querySelector('.content')).backgroundColor === 'rgb(0, 128, 0)' && computed(b.querySelector('.content')).backgroundColor === 'rgb(0, 128, 0)', 'allowed snippet not applied');
  const exportRoot = root(); const releaseExport = manager.register(exportRoot);
  check(computed(exportRoot).textIndent === '0px' && blocked.sheet.disabled === false, 'export registration not synchronous');
  releaseExport(); exportRoot.remove();
  checks.push('allowlist/independent-export/synchronous-registration');
  const duplicate = manager.register(b); duplicate();
  check(b.hasAttribute(marker) && computed(b).textIndent === '0px', 'duplicate scope cleanup removed active scope');
  removeA(); removeA();
  check(a.getAttribute(marker) === 'prior' && a.style.getPropertyValue('text-indent') === 'inherit', 'scope prior state not restored');
  check(computed(a).textIndent === '32px' && computed(b).textIndent === '0px', 'cleanup affected another root');
  checks.push('per-scope/refcount/idempotent-cleanup/restoration');
  blocked.textContent = blockedText.replace('32px','48px').replace('red!important','orange!important');
  const reloadedSheet = blocked.sheet;
  const reloadedOriginal = Array.from(reloadedSheet.cssRules).map(r=>r.cssText).join('\n');
  // Mutation delivery is native async; baseline disabling itself stays synchronous.
  await new Promise(resolve => setTimeout(resolve,0));
  check(computed(note).textIndent === '48px' && computed(b).textIndent === '0px', 'native text reload was not re-isolated');
  for (let cycle = 0; cycle < 10; cycle++) {
    manager.refresh(document); singleGuard();
    manager.configure(['blocked']); manager.refresh(document);
    check(Array.from(blocked.sheet.cssRules).map(r=>r.cssText).join('\n') === reloadedOriginal, 'reload/repeated opt-in originals not restored');
    check(computed(b).textIndent === '48px', 'reload/repeated opt-in retained baseline');
    manager.configure(['permitted']); singleGuard();
    check(computed(b).textIndent === '0px' && computed(note).textIndent === '48px', 'reload/repeated opt-out did not isolate Canvas');
  }
  const old = blocked;
  blocked = style('body {text-indent:64px!important;} .content {color:purple!important;}');
  entries = [{name:'blocked',element:blocked},{name:'permitted',element:permitted}]; old.remove();
  await new Promise(resolve => setTimeout(resolve,0));
  check(computed(note).textIndent === '64px' && computed(b).textIndent === '0px', 'native entry replacement not isolated');
  check(Array.from(reloadedSheet.cssRules).map(r=>r.cssText).join('\n') === reloadedOriginal, 'detached sheet exact native reload selectors not restored');
  checks.push('native-text-reload/entry-replacement');
  b.style.setProperty('text-indent','5px','important');
  manager.refresh(document);
  check(b.style.getPropertyValue('text-indent') === '5px', 'later inline native value overwritten');
  b.style.removeProperty('text-indent'); manager.refresh(document);
  const originalReplacement = blocked.textContent;
  const remainingSheet = blocked.sheet;
  removeB();
  check(Array.from(remainingSheet.cssRules).every(r => !r.cssText.includes('data-miro-canvas-snippet-scope')), 'last scope did not restore rules');
  check(!b.hasAttribute(marker) && b.style.getPropertyValue('--only') === '', 'last scope did not restore inline');
  manager.register(b); manager.dispose(); manager.dispose();
  check(blocked.textContent === originalReplacement && Array.from(blocked.sheet.cssRules).every(r => !r.cssText.includes('data-miro-canvas-snippet-scope')), 'unload did not restore exact native rules');
  check(diagnostics.length === 0, 'unexpected diagnostics: '+JSON.stringify(diagnostics.map(d=>d.message)));
  checks.push('latest-inline-value/last-root/unload');
  const unsupported = style('.content {color:magenta;} @keyframes collide {from {opacity:0;} to {opacity:1;}}');
  const unsupportedOriginal = Array.from(unsupported.sheet.cssRules).map(r=>r.cssText).join('\n');
  const errors = [];
  const refusal = new CanvasSnippetManager(() => [{name:'global',element:unsupported}], [], d=>errors.push(d));
  refusal.register(b);
  check(errors.some(d=>d.reason === 'unsupported-css'), 'unsupported global CSS missing diagnostic');
  check(Array.from(unsupported.sheet.cssRules).map(r=>r.cssText).join('\n') === unsupportedOriginal, 'unsupported CSS was partly rewritten');
  refusal.dispose(); unsupported.remove();
  const unknown = new CanvasSnippetManager(() => undefined, [], d=>errors.push(d));
  unknown.register(b); unknown.dispose();
  check(errors.some(d=>d.reason === 'native-shape'), 'unknown native shape missing diagnostic');
  checks.push('unsupported-css/native-shape/refusal');
  // An exception during the baseline must still restore all native sheets.
  const throwing = new CanvasSnippetManager(() => [{name:'blocked',element:blocked}], [], d=>errors.push(d));
  const originalGet = window.getComputedStyle;
  window.getComputedStyle = () => { throw new Error('baseline failure'); };
  throwing.register(b);
  window.getComputedStyle = originalGet;
  check(blocked.sheet.disabled === false && errors.some(d=>d.reason === 'baseline'), 'try/finally did not restore disabled sheets');
  throwing.dispose();
  const disabledSnippet = style('.content {font-size:80px!important;}');
  disabledSnippet.sheet.disabled = true;
  const disabledManager = new CanvasSnippetManager(() => [{name:'disabled',element:disabledSnippet}]);
  const releaseDisabled = disabledManager.register(b);
  check(disabledSnippet.sheet.disabled === true, 'pre-existing disabled sheet state lost during baseline');
  releaseDisabled(); disabledManager.dispose(); disabledSnippet.remove();
  // CSSOM selector edits and baseline disabling cannot queue recursive head mutations.
  let reads = 0;
  const idle = new CanvasSnippetManager(() => { reads++; return [{name:'blocked',element:blocked}]; });
  idle.register(b);
  const expectedReads = reads;
  await new Promise(resolve=>setTimeout(resolve,0));
  check(reads === expectedReads, 'own selector/baseline mutations recursively refreshed');
  idle.dispose();
  checks.push('baseline-error-finally/disabled-state/no-recursive-own-mutations');
  const frame = document.createElement('iframe'); document.body.appendChild(frame);
  const other = frame.contentDocument;
  other.body.innerHTML = '<div id="board"><p class="content">second document</p></div>';
  style('body {text-indent:21px;} .content {color:red!important;}', other);
  const otherSnippet = other.head.querySelector('style');
  const ownDoc = new CanvasSnippetManager(doc => doc === other ? [{name:'other',element:otherSnippet}] : [{name:'blocked',element:blocked}]);
  const releaseOne = ownDoc.register(b); const releaseOther = ownDoc.register(other.getElementById('board'));
  check(other.defaultView.getComputedStyle(other.getElementById('board')).textIndent === '0px', 'second-document baseline uses wrong window');
  releaseOne(); check(other.defaultView.getComputedStyle(other.getElementById('board')).textIndent === '0px', 'first-document release affected second');
  releaseOther(); ownDoc.dispose(); frame.remove();
  checks.push('document-isolation/owning-window');
  return checks;
}`;

// A real CSSOM is mandatory for cascade/inheritance proof; never label mocks as it.
const browserAvailable = spawnSync("python", ["-c", "import playwright.sync_api"], { encoding: "utf8" }).status === 0;
describe.skipIf(!browserAvailable)("Chromium CSSOM (local Python Playwright, no network)", () => {
  let result: { browser: string; checks: string[] };
  beforeAll(() => {
    const bundle = buildSync({ entryPoints: ["src/canvas-snippets.ts"], bundle: true, write: false, format: "iife", globalName: "SnippetAPI", platform: "browser", target: "es2020" }).outputFiles[0].text;
    const run = spawnSync("python", ["-c", pythonBrowser], { input: JSON.stringify({ bundle, test: browserTest }), encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 });
    if (run.status !== 0) throw new Error(`Local Chromium CSSOM check failed: ${run.stderr || run.error?.message}`);
    result = JSON.parse(run.stdout) as typeof result;
  }, 65000);
  it("verifies real selectors, notes, two roots, inheritance, lifecycle and document ownership", () => {
    expect(result.browser).toMatch(/^\d+\./u);
    expect(result.checks).toHaveLength(9);
    expect(result.checks).toContain("repeated-real-cssom-refresh-opt-in-opt-out");
    expect(result.checks).toContain("default/two-roots/note/specificity/pseudo/media/supports/nesting/important/inheritance");
  });
});
