// Parent-run real-host DOM instrumentation. Preparation never connects to apps.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { connectTarget } from "./cdp.mjs";

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(toolDirectory, "../..");
const outputDirectory = path.join(toolDirectory, ".out/l20-authoring-dom");
const uiRoots = {
  "m2-tools": ".miro-canvas-m2-tools",
  "panel-arrange": ".miro-canvas-arrange-banner,.miro-canvas-arrange-tray,.miro-canvas-arrange-handle,.miro-canvas-arrange-ghost,.miro-canvas-arrange-insertion",
  "panel-visibility": ".miro-canvas-panel-toggle",
  "document-controls": ".miro-canvas-document-controls",
  "slide-show": ".miro-canvas-slideshow",
  "board-export": ".miro-canvas-export,.miro-canvas-export-pages,.miro-canvas-export-progress",
};

function argumentsOf(argv) {
  if (argv.length === 1 && argv[0] === "--help") return undefined;
  const known = new Set(["--platform", "--port", "--main-target", "--expected-vault", "--popout-target", "--label", "--out", "--require-ui"]);
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    assert.ok(known.has(flag) && !(flag in options), `unknown or repeated argument: ${flag}`);
    assert.ok(argv[index + 1] && !argv[index + 1].startsWith("--"), `missing value: ${flag}`);
    options[flag] = argv[index + 1];
  }
  assert.ok(["windows", "android"].includes(options["--platform"]), "explicit --platform windows|android required");
  const port = Number(options["--port"]);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, "explicit valid --port required");
  assert.ok(options["--main-target"], "exact --main-target ID required");
  const label = options["--label"] ?? "current";
  assert.match(label, /^[a-z0-9-]{1,64}$/u);
  const output = path.resolve(options["--out"] ?? path.join(outputDirectory, `dom-native-${label}.json`));
  const relativeOutput = path.relative(outputDirectory, output);
  assert.ok(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput), "--out must be inside the exclusive CDP artifact directory");
  const normalize = value => value.replaceAll("\\", "/").replace(/\/$/u, "").toLowerCase();
  const expectedVault = options["--expected-vault"];
  if (options["--platform"] === "windows") {
    assert.ok(expectedVault && path.isAbsolute(expectedVault), "Windows requires an absolute --expected-vault");
    const relativeVault = path.relative(path.join(toolDirectory, ".out"), path.resolve(expectedVault));
    assert.ok(relativeVault && !relativeVault.startsWith("..") && !path.isAbsolute(relativeVault), "Windows requires this repository's isolated CDP .out vault");
  } else {
    assert.ok(!expectedVault && !options["--popout-target"], "Android uses MiroCanvasTest only; no Windows vault/popout arguments");
  }
  const requiredUi = options["--require-ui"] ? options["--require-ui"].split(",") : [];
  assert.ok(requiredUi.every(name => name in uiRoots), "unknown --require-ui module");
  assert.notEqual(options["--main-target"], options["--popout-target"], "main and popout targets must differ");
  return { platform: options["--platform"], port, main: options["--main-target"], popout: options["--popout-target"],
    expectedVault: expectedVault ? normalize(path.resolve(expectedVault)) : undefined,
    isolatedPrefix: normalize(path.join(toolDirectory, ".out")) + "/", requiredUi, output, label };
}

async function bounded(operation, description) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${description} timed out`)), 12000); })]);
  } finally {
    clearTimeout(timer);
  }
}

async function evaluateQuiet(send, expression) {
  const result = await bounded(send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: false, silent: true }), "renderer evaluation");
  if (result.error) throw new Error(result.error.message);
  const details = result.result?.exceptionDetails;
  if (details) throw new Error(details.exception?.description ?? details.text);
  assert.ok(result.result?.result && "value" in result.result.result, "renderer produced no serializable report");
  return result.result.result.value;
}

// This function is serialized into each explicitly selected renderer.
function guardRenderer(options) {
  if (typeof app === "undefined" || !app.vault || !app.workspace) throw new Error("ready Obsidian test vault required");
  const mobile = app.isMobile === true;
  let windowId = null;
  let base = null;
  if (options.platform === "android") {
    if (!mobile || app.vault.getName() !== "MiroCanvasTest") throw new Error("Android instrumentation requires MiroCanvasTest");
  } else {
    if (mobile || !navigator.userAgent.includes("Windows")) throw new Error("hidden Windows renderer required");
    base = app.vault.adapter.getBasePath?.()?.replaceAll("\\", "/").replace(/\/$/u, "").toLowerCase();
    if (!base || base !== options.expectedVault || !base.startsWith(options.isolatedPrefix)) throw new Error("exact isolated test vault required");
    const window = require("@electron/remote").getCurrentWindow();
    if (window.isDestroyed() || window.isVisible()) throw new Error("parent must supply an already-hidden live window");
    windowId = window.id;
  }
  return { platform: options.platform, vault: app.vault.getName(), base, windowId,
    installedPluginVersion: app.plugins?.plugins?.["miro-canvas"]?.manifest?.version ?? null,
    activeFile: app.workspace.getActiveFile()?.path ?? null, userAgent: navigator.userAgent };
}

// Synchronous and self-restoring, so no await can leave a forwarding wrapper installed.
function probeRealm(factory, ownerDocument, name, expectHelpers) {
  const owner = ownerDocument.defaultView;
  const htmlNamespace = "http://www.w3.org/1999/xhtml";
  const svgNamespace = "http://www.w3.org/2000/svg";
  const calls = { htmlHelper: [], svgHelper: [], htmlNative: [], svgNative: [] };
  const restorers = [];
  const elements = [];
  const result = { name, helperPresence: { html: typeof owner?.createEl === "function", svg: typeof owner?.createSvg === "function" }, calls, elements, passed: false, restored: false };
  const require = (condition, message) => { if (!condition) throw new Error(`${name}: ${message}`); };
  const htmlNative = ownerDocument.createElement;
  const svgNative = ownerDocument.createElementNS;
  function wrap(target, key, list) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    const original = target[key];
    const wrapped = function (...args) {
      list.push({ receiver: this === target, arguments: args.map(value => typeof value === "string" ? value : typeof value) });
      return Reflect.apply(original, this, args);
    };
    Object.defineProperty(target, key, { configurable: true, writable: true, value: wrapped });
    restorers.push(() => {
      if (descriptor === undefined) delete target[key];
      else Object.defineProperty(target, key, descriptor);
      require(target[key] === original, `failed to restore ${key}`);
      const restored = Object.getOwnPropertyDescriptor(target, key);
      require(descriptor === undefined ? restored === undefined : restored?.value === descriptor.value && restored?.get === descriptor.get
        && restored?.set === descriptor.set && restored?.writable === descriptor.writable
        && restored?.enumerable === descriptor.enumerable && restored?.configurable === descriptor.configurable, `descriptor changed for ${key}`);
    });
  }
  try {
    require(owner !== null, "owning window missing");
    require(result.helperPresence.html === expectHelpers && result.helperPresence.svg === expectHelpers, "unexpected helper availability");
    if (expectHelpers) { wrap(owner, "createEl", calls.htmlHelper); wrap(owner, "createSvg", calls.svgHelper); }
    wrap(ownerDocument, "createElement", calls.htmlNative);
    wrap(ownerDocument, "createElementNS", calls.svgNative);
    const inspect = (tag, svg) => {
      const reference = svg ? Reflect.apply(svgNative, ownerDocument, [svgNamespace, tag]) : Reflect.apply(htmlNative, ownerDocument, [tag]);
      const element = svg ? factory.createSvgElement(ownerDocument, tag) : factory.createHtmlElement(ownerDocument, tag);
      const data = { tag, namespace: element.namespaceURI, ownerDocument: element.ownerDocument === ownerDocument,
        constructor: element.constructor.name, sameNativeConstructor: element.constructor === reference.constructor,
        sameRealm: element instanceof owner.Element, detached: element.parentNode === null && !element.isConnected,
        children: element.childNodes.length, attributes: element.attributes.length };
      elements.push(data);
      require(data.ownerDocument && data.sameNativeConstructor && data.sameRealm && data.detached, `wrong ownership/constructor/attachment: ${tag}`);
      require(element.localName === tag && data.namespace === (svg ? svgNamespace : htmlNamespace), `wrong tag/namespace: ${tag}`);
      require(data.children === 0 && data.attributes === 0, `unexpected initial content: ${tag}`);
    };
    for (const tag of ["div", "span", "button", "section", "h3", "p", "input", "select", "option", "label", "fieldset", "legend", "canvas"]) inspect(tag, false);
    for (const tag of ["svg", "path", "rect", "circle"]) inspect(tag, true);
    require(calls.htmlHelper.length === (expectHelpers ? 13 : 0) && calls.svgHelper.length === (expectHelpers ? 4 : 0), "incorrect helper routing count");
    require(calls.htmlNative.length === 13 && calls.svgNative.length === 4, "incorrect native realm forwarding count");
    require(Object.values(calls).every(list => list.every(call => call.receiver)), "creation receiver changed");
    result.passed = true;
  } catch (error) {
    result.error = error.message;
  } finally {
    const errors = [];
    for (const restore of restorers.reverse()) { try { restore(); } catch (error) { errors.push(error.message); } }
    result.restored = errors.length === 0;
    if (errors.length) { result.passed = false; result.restorationErrors = errors; }
  }
  return result;
}

function sampleInstalledUi(selectors) {
  return Object.entries(selectors).map(([module, selector]) => {
    const roots = [...document.querySelectorAll(selector)];
    const nodes = [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll("*")]))].slice(0, 256);
    const samples = nodes.map(element => {
      const owner = element.ownerDocument.defaultView;
      return { tag: element.localName, namespace: element.namespaceURI, ownerDocument: element.ownerDocument === document,
        constructor: element.constructor.name, sameRealm: owner !== null && element instanceof owner.Element,
        sameRealmConstructor: owner?.[element.constructor.name] === element.constructor,
        connected: element.isConnected, parent: element.parentElement?.localName ?? null };
    });
    return { module, selector, roots: roots.length, checked: samples.length,
      status: roots.length === 0 ? "pending-parent-mount" : samples.every(item => item.ownerDocument && item.sameRealm && item.sameRealmConstructor) ? "sampled" : "failed",
      samples };
  });
}

function rendererProbe(factory, role, selectors) {
  const focused = document.activeElement;
  const activeFile = app.workspace.getActiveFile()?.path ?? null;
  const result = { role, realms: [], installedUi: [], iframeRemoved: null };
  result.realms.push(probeRealm(factory, document, role, true));
  if (role === "main") {
    let iframe;
    const originalHtml = window.createEl;
    const originalSvg = window.createSvg;
    let mainHtmlCalls = 0;
    let mainSvgCalls = 0;
    const htmlDescriptor = Object.getOwnPropertyDescriptor(window, "createEl");
    const svgDescriptor = Object.getOwnPropertyDescriptor(window, "createSvg");
    let htmlWrapped = false;
    let svgWrapped = false;
    try {
      // Explicitly native, hidden about:blank fixture; never a production-helper append.
      iframe = Reflect.apply(document.createElement, document, ["iframe"]);
      iframe.hidden = true;
      iframe.tabIndex = -1;
      iframe.src = "about:blank";
      document.body.appendChild(iframe);
      Object.defineProperty(window, "createEl", { configurable: true, writable: true, value: function (...args) { mainHtmlCalls++; return Reflect.apply(originalHtml, this, args); } });
      htmlWrapped = true;
      Object.defineProperty(window, "createSvg", { configurable: true, writable: true, value: function (...args) { mainSvgCalls++; return Reflect.apply(originalSvg, this, args); } });
      svgWrapped = true;
      if (iframe.contentDocument === null) throw new Error("plain iframe document unavailable");
      const frame = probeRealm(factory, iframe.contentDocument, "plain-iframe", false);
      frame.mainHelperCalls = { html: mainHtmlCalls, svg: mainSvgCalls };
      if (mainHtmlCalls || mainSvgCalls) { frame.passed = false; frame.error = "plain iframe touched main helpers"; }
      result.realms.push(frame);
    } catch (error) {
      result.realms.push({ name: "plain-iframe", passed: false, error: error.message });
    } finally {
      const errors = [];
      for (const [name, wrapped, descriptor] of [["createSvg", svgWrapped, svgDescriptor], ["createEl", htmlWrapped, htmlDescriptor]]) {
        if (!wrapped) continue;
        try { if (descriptor === undefined) delete window[name]; else Object.defineProperty(window, name, descriptor); }
        catch (error) { errors.push(error.message); }
      }
      try { iframe?.remove(); } catch (error) { errors.push(error.message); }
      result.iframeRemoved = iframe === undefined || !iframe.isConnected;
      result.mainHelpersRestored = errors.length === 0 && window.createEl === originalHtml && window.createSvg === originalSvg;
      if (errors.length) result.restorationErrors = errors;
    }
  }
  result.installedUi = sampleInstalledUi(selectors);
  result.focusUnchanged = document.activeElement === focused;
  result.activeFileUnchanged = (app.workspace.getActiveFile()?.path ?? null) === activeFile;
  result.passed = result.realms.every(realm => realm.passed && realm.restored)
    && result.focusUnchanged && result.activeFileUnchanged && result.installedUi.every(item => item.status !== "failed")
    && (role !== "main" || result.iframeRemoved && result.mainHelpersRestored);
  return result;
}

async function main() {
  const options = argumentsOf(process.argv.slice(2));
  if (!options) {
    console.log("Usage: node tools/obsidian_cdp/check-dom-owners.mjs --platform windows|android --port PORT --main-target ID [--expected-vault ABSOLUTE_ISOLATED_VAULT] [--popout-target ALREADY_HIDDEN_ID] [--require-ui MODULES] [--label LABEL] [--out EXCLUSIVE_REPORT]\nNo app launch, input, screenshots, hiding, foregrounding, UI mounting or popout creation. Windows must already be hidden; Android requires MiroCanvasTest. --help never connects.");
    return;
  }
  const helper = path.join(repository, "src/dom-elements.ts");
  const compiled = await build({ entryPoints: [helper], absWorkingDir: repository, bundle: true, write: false,
    format: "iife", globalName: "DOMOwnerProbe", platform: "browser", target: "es2020", metafile: true, logLevel: "silent" });
  const inputs = Object.keys(compiled.metafile.inputs);
  assert.equal(inputs.length, 1, "DOM helper must be standalone and pure");
  assert.equal(path.resolve(repository, inputs[0]), helper);
  assert.ok(Object.values(compiled.metafile.inputs).every(input => input.imports.length === 0), "DOM helper must have no runtime imports");
  const bundle = compiled.outputFiles[0].text;
  const hash = text => createHash("sha256").update(text).digest("hex");
  const report = { classification: "installed host environment; synthetic CDP DOM instrumentation; no ADB/OS/physical input", label: options.label,
    helperSourceSha256: hash(readFileSync(helper)), helperIifeSha256: hash(bundle), inputs,
    targets: [], popout: options.popout ? "supplied-parent-target" : "pending-parent-hidden-target", passed: false };
  const sessions = [];
  try {
    const response = await fetch(`http://127.0.0.1:${options.port}/json`, { signal: AbortSignal.timeout(10000) });
    assert.ok(response.ok, "CDP target discovery failed");
    const targets = await response.json();
    for (const [role, id] of [["main", options.main], ["popout", options.popout]]) {
      if (!id) continue;
      const target = targets.find(item => item.id === id && item.type === "page");
      assert.ok(target, `exact supplied ${role} target not found`);
      const socket = new URL(target.webSocketDebuggerUrl);
      assert.ok(socket.protocol === "ws:" && ["127.0.0.1", "localhost", "[::1]"].includes(socket.hostname)
        && Number(socket.port) === options.port && !socket.username && !socket.password, "local supplied CDP endpoint required");
      const connecting = connectTarget(target);
      try {
        const session = await bounded(connecting, "CDP connection");
        sessions.push({ ...session, role, id });
      } catch (error) {
        connecting.then(session => session.close(), () => {});
        throw error;
      }
    }
    // Preflight ALL parent-supplied targets before compiling code into a renderer.
    for (const session of sessions) {
      session.preflight = await evaluateQuiet(session.send, `(${guardRenderer.toString()})(${JSON.stringify(options)})`);
    }
    if (sessions.length > 1) assert.notEqual(sessions[0].preflight.windowId, sessions[1].preflight.windowId, "popout must be a distinct already-hidden window");
    for (const session of sessions) {
      const expression = `(() => {
        const guard = ${guardRenderer.toString()};
        const before = guard(${JSON.stringify(options)});
        const factory = (() => { ${bundle}; return DOMOwnerProbe; })();
        const probeRealm = ${probeRealm.toString()};
        const sampleInstalledUi = ${sampleInstalledUi.toString()};
        const result = (${rendererProbe.toString()})(factory, ${JSON.stringify(session.role)}, ${JSON.stringify(uiRoots)});
        const after = guard(${JSON.stringify(options)});
        return { targetId: ${JSON.stringify(session.id)}, before, after, ...result };
      })()`;
      const result = await evaluateQuiet(session.send, expression);
      report.targets.push(result);
      assert.ok(result.passed, `${session.role} DOM-owner probe failed; inspect report`);
      assert.equal(result.before.windowId, result.after.windowId, "native window identity changed");
    }
    report.requiredUi = options.requiredUi.map(module => ({ module,
      sampled: report.targets.some(target => target.installedUi.some(item => item.module === module && item.status === "sampled")) }));
    assert.ok(report.requiredUi.every(item => item.sampled), "required installed UI roots are pending parent mounting");
    report.passed = true;
  } catch (error) {
    report.error = error.message;
    process.exitCode = 1;
  } finally {
    for (const session of sessions) session.close();
    mkdirSync(path.dirname(options.output), { recursive: true });
    writeFileSync(options.output, JSON.stringify(report, null, 2).replace(/\n/g, "\r\n") + "\r\n", "utf8");
    console.log(JSON.stringify({ report: options.output, passed: report.passed, popout: report.popout,
      installedUi: report.targets.map(target => ({ role: target.role, modules: target.installedUi.map(({ module, status }) => ({ module, status })) })), error: report.error }, null, 2));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
