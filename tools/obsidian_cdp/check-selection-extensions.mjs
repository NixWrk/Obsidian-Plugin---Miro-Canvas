// Parent-leased installed selection repair check. --help/--check-fixture never connect.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify, isDeepStrictEqual } from "node:util";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectTarget, evaluate, pressKey } from "./cdp.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, "../..");
const artifacts = path.join(directory, ".out/l20-data");
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = document => {
  const copy = clone(document);
  for (const field of ["nodes", "edges"]) copy[field]?.sort((a, b) => a.id.localeCompare(b.id));
  return copy;
};
const extra = { future: { nested: [1, { keep: true }] } };
const cases = ["whole-group", "captured-free-ends"];
function fixture(nonce) {
  return { future: { ...extra.future, nonce },
    nodes: [{ id: "frame", type: "group", label: "Group", x: -12, y: -12, width: 75, height: 75 },
      { id: "a", type: "text", text: "A", x: 0, y: 0, width: 30, height: 30 },
      { id: "b", type: "text", text: "B", x: 300, y: 0, width: 30, height: 30 }],
    edges: [{ id: "native", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left", future: extra }],
    miroSource: { items: [{ id: "source", future: extra }], comments: [
      { id: "imported", text: "Imported", anchor: { type: "free", x: 55, y: 70, ...extra } }], future: extra },
    miroCanvas: { schemaVersion: 1, future: extra,
      localOverrides: { native: { future: extra, connector: { route: "curved", waypoints: [{ x: 100, y: 60, ...extra }], future: extra },
        connectorAnchors: { from: { type: "free", x: 15, y: 15, ...extra }, to: { type: "free", x: 315, y: 15, ...extra }, future: extra } } },
      connectors: { line: { id: "line", from: { type: "free", x: 15, y: 15, ...extra }, to: { type: "free", x: 400, y: 15, ...extra },
        waypoints: [{ x: 100, y: 60, ...extra }], route: "curved", color: "#123456", width: 2, startCap: "none", endCap: "arrow", future: extra },
        chain:{id:'chain',from:{type:'edge',edgeId:'line',t:0,...extra},to:{type:'free',x:420,y:120,...extra},route:'straight',color:'#123456',width:2,startCap:'none',endCap:'arrow',future:extra} },
      localComments: [{ id: "local", text: "Local", anchor: { type: "free", x: 15, y: 35, ...extra }, replies: [], future: extra }], commentPlaces: {} } };
}
function expectedMove(before, kind, dx, dy) {
  const next = clone(before);
  const shift = point => ({ ...point, x: point.x + dx, y: point.y + dy });
  const free = anchor => {
    const moved = shift(anchor);
    for (const key of ["kind", "nodeId", "edgeId", "commentId", "origin", "targetId", "elementId", "u", "v", "t"]) delete moved[key];
    return { ...moved, type: "free" };
  };
  for (const node of next.nodes) if (node.id !== "b" || kind === "whole-group") Object.assign(node, shift(node));
  const native = next.miroCanvas.localOverrides.native, line = next.miroCanvas.connectors.line;
  for (const record of [native.connectorAnchors, line]) {
    record.from = free(record.from);
    if (kind === "whole-group") record.to = free(record.to);
  }
  if (kind === "whole-group") {
    native.connector.waypoints = native.connector.waypoints.map(shift);
    line.waypoints = line.waypoints.map(shift);
  }
  for (const [origin, id, anchor] of [["local", "local", next.miroCanvas.localComments[0].anchor], ["imported", "imported", next.miroSource.comments[0].anchor]]) {
    const key = `${origin}:${id}`;
    next.miroCanvas.commentPlaces[key] = free(next.miroCanvas.commentPlaces[key] ?? anchor);
  }
  return next;
}
function nativeCommit(document) {
  const next = clone(document);
  for (const node of next.nodes) { node.x = Math.round(node.x); node.y = Math.round(node.y); }
  return next;
}
function argumentsOf(argv) {
  const known = new Set(["--platform", "--port", "--target", "--expected-vault", "--serial", "--main-sha", "--css-sha", "--label", "--case", "--zoom"]);
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    assert.ok(known.has(flag) && !(flag in options) && argv[index + 1] && !argv[index + 1].startsWith("--"), `invalid argument ${flag}`);
    options[flag] = argv[index + 1];
  }
  const platform = options["--platform"], port = Number(options["--port"]), target = options["--target"], label = options["--label"] ?? "current";
  assert.ok(["windows", "android"].includes(platform) && Number.isInteger(port) && port > 0 && port <= 65535 && target, "explicit platform, port and exact target required");
  assert.match(label, /^[a-z0-9-]{1,64}$/u);
  const mainSha = options["--main-sha"]?.toLowerCase(), cssSha = options["--css-sha"]?.toLowerCase();
  assert.match(mainSha ?? "", /^[a-f0-9]{64}$/u); assert.match(cssSha ?? "", /^[a-f0-9]{64}$/u);
  assert.equal(hash(readFileSync(path.join(repository, "main.js"))), mainSha, "frozen repository main mismatch");
  assert.equal(hash(readFileSync(path.join(repository, "styles.css"))), cssSha, "frozen repository CSS mismatch");
  const serial = options["--serial"];
  const caseName=options['--case'],zoomLevel=options['--zoom']===undefined?undefined:Number(options['--zoom']);
  assert.ok(caseName===undefined||cases.includes(caseName));assert.ok(zoomLevel===undefined||[0.5,1.25].includes(zoomLevel));
  let expectedVault;
  if (platform === "windows") {
    assert.ok(!serial && options["--expected-vault"] && path.isAbsolute(options["--expected-vault"]), "Windows needs the exact isolated vault, no serial");
    expectedVault = path.resolve(options["--expected-vault"]);
    const relative = path.relative(path.join(directory, ".out"), expectedVault);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "vault must be inside this checkout's CDP .out");
  } else {
    assert.match(serial ?? "", /^[A-Za-z0-9_.:-]{1,100}$/u);
    assert.ok(!options["--expected-vault"], "Android is MiroCanvasTest only");
  }
  return { platform, port, target, label, serial, mainSha, cssSha, expectedVault, caseName, zoomLevel,
    isolatedPrefix: path.join(directory, ".out").replaceAll("\\", "/").toLowerCase() + "/" };
}
function guardRenderer(options) {
  if (!app?.vault || !app.plugins.plugins["miro-canvas"]) throw Error("ready installed plugin required");
  if (options.platform === "android") {
    if (!app.isMobile || app.vault.getName() !== "MiroCanvasTest") throw Error("Android test vault required");
  } else {
    const base = app.vault.adapter.getBasePath?.()?.replaceAll("\\", "/").replace(/\/$/u, "").toLowerCase();
    const expected = options.expectedVault.replaceAll("\\", "/").toLowerCase();
    const window = require("@electron/remote").getCurrentWindow();
    if (app.isMobile || !navigator.userAgent.includes("Windows") || base !== expected || !base.startsWith(options.isolatedPrefix)
      || window.isDestroyed() || window.isVisible()) throw Error("exact already-hidden isolated Windows required");
  }
}
function inspect() {
  const canvas = app.workspace.activeLeaf.view.canvas, session = app.plugins.plugins["miro-canvas"].m1Session;
  if (!canvas || !session?.root || session.root.ownerDocument.defaultView !== window) throw Error("leased window does not own the active native Canvas");
  const geometry = session.landingGeometry().geometry;
  const native = canvas.edges.get("native")?.lineGroupEl?.querySelector("path.canvas-display-path");
  const line = session.root.querySelector('[data-connector-id="line"]');
  const chain=session.root.querySelector('[data-connector-id="chain"]');
  const pins = Object.fromEntries(["local", "imported"].map(origin => {
    const button = session.root.querySelector(`[data-comment-origin="${origin}"][data-comment-id="${origin}"]`);
    const box = button?.getBoundingClientRect();
    return [origin, box ? { x: box.x, y: box.y } : null];
  }));
  const expectedPaths = {};
  for (const [id, element] of [["native", native], ["line", line], ['chain',chain]]) {
    const route = geometry.edges[id];
    if (!element || !route?.segments) throw Error("actual route/path unavailable");
    const local = element.getCTM(), board = element.ownerSVGElement.getCTM();
    const matrix = local && board ? local.inverse().multiply(board) : null;
    const at = point => {
      const x = matrix ? matrix.a * point.x + matrix.c * point.y + matrix.e : point.x;
      const y = matrix ? matrix.b * point.x + matrix.d * point.y + matrix.f : point.y;
      return `${Math.round(x * 1000) / 1000} ${Math.round(y * 1000) / 1000}`;
    };
    expectedPaths[id] = `M ${at(route.start)}` + route.segments.map(segment => segment.kind === "line"
      ? ` L ${at(segment.to)}` : ` C ${at(segment.c1)} ${at(segment.c2)} ${at(segment.to)}`).join("");
  }
  return { data: canvas.getData(), expectedPaths, frame:session.root.querySelector('.miro-canvas-mixed-selection-frame')?.getBoundingClientRect().toJSON(), preview: session.selectionMovePreview ?? null, shift: session.selectionMoveShift ?? null,
    history: canvas.history.current, zoom: 2 ** canvas.tZoom, masks: Object.fromEntries(session.selectedRouteEnds),
    paths: { native: native?.getAttribute("d") ?? null, line: line?.getAttribute("d") ?? null,chain:chain?.getAttribute('d')??null }, pins,
    geometry: { native: geometry.edges.native, line: geometry.edges.line,chain:geometry.edges.chain }, events: window.__l20SelectionExtensions?.events ?? [] };
}
async function prepare(kind, zoom, nonce) {
  const canvas = app.workspace.activeLeaf.view.canvas, session = app.plugins.plugins["miro-canvas"].m1Session;
  if (session.currentRawDocument?.future?.nonce !== nonce) throw Error("session identity mismatch");
  session.resetTools();
  const ids = kind === "whole-group" ? ["frame", "a", "b", "native"] : ["frame", "a", "native"];
  for (const id of ids) canvas.selection.add(canvas.nodes.get(id) ?? canvas.edges.get(id));
  session.connectorLayer.select(["line"]);
  for (const origin of ["local", "imported"]) session.selectedCommentKeys.add(`${origin}:${origin}`);
  if (kind === "captured-free-ends") for (const id of ["native", "line"]) session.selectedRouteEnds.set(id, { from: true, to: false, wholeRoute: false });
  session.refresh();
  canvas.zoomToBbox({ minX: -45, minY: -45, maxX: kind==='captured-free-ends'?115:440, maxY: 150 });
  const deadline=performance.now()+3000;
  while(canvas.x!==canvas.tx||canvas.y!==canvas.ty||canvas.zoom!==canvas.tZoom){
    if(performance.now()>deadline)throw Error('native centering animation did not settle');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  canvas.setViewport(canvas.tx, canvas.ty, Math.log2(zoom));
  window.__l20SelectionExtensions.events = [];
  return {target:zoom,tZoom:canvas.tZoom,zoom:canvas.zoom,tx:canvas.tx,ty:canvas.ty};
}
function dragPoint() {
  const root = app.plugins.plugins["miro-canvas"].m1Session.root, frame = root.querySelector(".miro-canvas-mixed-selection-frame");
  if (!frame) throw Error("mixed native selection frame absent");
  const rect = frame.getBoundingClientRect();
  const points = [{ x: rect.left + 2, y: rect.top + rect.height / 2 }, { x: rect.left + rect.width / 2, y: rect.bottom - 2 }, { x: rect.right - 2, y: rect.top + rect.height / 2 }];
  const point = points.find(point => point.x > 30 && point.y > 30 && point.x + 24 < innerWidth - 30 && point.y + 16 < innerHeight - 30 && frame.contains(document.elementFromPoint(point.x, point.y)));
  if (!point) throw Error("no unobscured, viewport-contained native selection frame grip");
  return point;
}
async function bounded(promise, name) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${name} timed out`)), 12000); })]); }
  finally { clearTimeout(timer); }
}
async function run(options) {
  const report = { options, passed: false, preparation: "Native APIs create scratch fixtures, select group/native/independent/comments, seed endpoint masks and set zoom; not a marquee gesture",
    input: options.serial ? "serial-specific ADB touchscreen motionevent and dock taps; no hardware-stylus claim" : "trusted background CDP renderer pointer/key synthesis; no OS input, screenshots or foregrounding", checks: [], commands: [], restorationErrors: [] };
  const adb = process.env.ADB ?? "C:/Program Files/VirtualTablet Server/adb/adb.exe", exec = promisify(execFile);
  const shell = async argv => (await exec(adb, ["-s", options.serial, ...argv], { windowsHide: true, timeout: 12000, maxBuffer: 8 * 1024 * 1024 })).stdout;
  if (options.serial) {
    const pid = (await shell(["shell", "pidof", "md.obsidian"])).trim().split(/\s+/u)[0];
    const forwards = await shell(["forward", "--list"]);
    assert.ok(pid && forwards.split(/\r?\n/u).some(row => row.trim() === `${options.serial} tcp:${options.port} localabstract:webview_devtools_remote_${pid}`), "exact serial/port/WebView PID forward required");
    report.device = { serial: options.serial, model: (await shell(["shell", "getprop", "ro.product.model"])).trim(), android: (await shell(["shell", "getprop", "ro.build.version.release"])).trim(), appVersion: /versionName=([^\r\n]+)/u.exec(await shell(["shell", "dumpsys", "package", "md.obsidian"]))?.[1] ?? null };
  }
  const response = await fetch(`http://127.0.0.1:${options.port}/json`, { signal: AbortSignal.timeout(12000) });
  assert.ok(response.ok); const target = (await response.json()).find(target => target.id === options.target && target.type === "page");
  assert.ok(target, "exact parent-supplied page missing"); const socket = new URL(target.webSocketDebuggerUrl);
  assert.ok(!socket.username && !socket.password && socket.protocol === "ws:" && ["localhost", "127.0.0.1", "[::1]"].includes(socket.hostname) && Number(socket.port) === options.port, "loopback socket on leased port only");
  const connecting = connectTarget(target);
  let client;
  try { client = await bounded(connecting, "CDP connection"); }
  catch (error) { connecting.then(client => client.close(), () => {}); throw error; }
  const checked = async (fn, ...args) => {
    const result = await bounded(evaluate(client.send, `(${guardRenderer.toString()})(${JSON.stringify(options)});return (${fn.toString()})(...${JSON.stringify(args)});`), "guarded renderer evaluation");
    if (result?.error) throw Error(result.error); return result;
  };
  let saved, held = false, lastPoint, fixtureFile, probeOwned = false;
  async function verifyHashes() {
    const installed = await checked(async () => {
      const plugin = app.plugins.plugins["miro-canvas"], dir = plugin.manifest.dir ?? `${app.vault.configDir}/plugins/miro-canvas`;
      return { main: await app.vault.adapter.read(`${dir}/main.js`), css: await app.vault.adapter.read(`${dir}/styles.css`) };
    });
    const hashes = { main: hash(installed.main), css: hash(installed.css) };
    assert.equal(hashes.main, options.mainSha, "installed frozen main"); assert.equal(hashes.css, options.cssSha, "installed frozen CSS"); return hashes;
  }
  async function input(phase, point) {
    await checked(file => { if (!file || app.workspace.getActiveFile()?.path !== file) throw Error("leased scratch fixture changed; no input sent"); }, fixtureFile);
    if (options.serial) {
      const focus = await shell(["shell", "dumpsys", "window"]);
      assert.ok(focus.split("\n").find(line => line.includes("mCurrentFocus="))?.includes("md.obsidian/"), "Obsidian must already be foreground on leased Android");
      const ratio = await checked(() => devicePixelRatio), type = { down: "DOWN", move: "MOVE", up: "UP", cancel: "CANCEL" }[phase];
      const command = ["shell", "input", "touchscreen", "motionevent", type, String(Math.round(point.x * ratio)), String(Math.round(point.y * ratio))];
      report.commands.push({ phase, css: point, adb: command.slice(1) }); await shell(command);
    } else {
      const message = await bounded(client.send("Input.dispatchMouseEvent", { type: { down: "mousePressed", move: "mouseMoved", up: "mouseReleased" }[phase], ...point, button: "left", buttons: phase === "up" ? 0 : 1, clickCount: 1 }), "renderer pointer");
      assert.ok(!message.error, message.error?.message); report.commands.push({ phase, css: point, input: "CDP" });
    }
    lastPoint = point; held = phase !== "up" && phase !== "cancel";
  }
  async function tap(selector) {
    const point = await checked(selector => {
      const root = app.plugins.plugins["miro-canvas"].m1Session.root, button = root.querySelector(selector)?.closest("button"), rect = button?.getBoundingClientRect();
      if (!rect || !rect.width) throw Error("native dock action unavailable");
      const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      if (!button.contains(document.elementFromPoint(point.x, point.y))) throw Error("native dock action obscured"); return point;
    }, selector);
    await input("down", point); await input("up", point); await wait(1000);
  }
  async function settleScratch(file) {
    await checked(async file => {
      const view = app.workspace.activeLeaf.view, session = app.plugins.plugins["miro-canvas"].m1Session;
      if (view.file?.path !== file || typeof view.save !== "function") throw Error("native scratch save unavailable");
      session.refresh(); view.canvas.requestSave(false); await view.save();
    }, file);
    let previous, stable = 0;
    for (let sample = 0; sample < 40; sample += 1) {
      const settled = await checked(async file => {
        const view = app.workspace.activeLeaf.view;
        if (view.file?.path !== file) throw Error("scratch changed during settlement");
        return { text: await app.vault.read(view.file), data: view.canvas.getData(), dirty: !!view.dirty, saving: !!view.saving };
      }, file);
      if (!settled.dirty && !settled.saving && JSON.stringify(canonical(JSON.parse(settled.text))) === JSON.stringify(canonical(settled.data))) {
        stable = previous === settled.text ? stable + 1 : 1; previous = settled.text;
        if (stable >= 5) return { samples: sample + 1, stable, sha256: hash(settled.text) };
      } else { stable = 0; previous = undefined; }
      await wait(200);
    }
    throw Error("native scratch bytes/fields never settled; no pointer sent");
  }
  const state = () => checked(inspect);
  const disk = () => checked(async () => app.vault.read(app.workspace.getActiveFile()));
  async function awaitSaved(expected) {
    let actual;
    for (let sample = 0; sample < 40; sample += 1) {
      actual = canonical(JSON.parse(await disk()));
      if (isDeepStrictEqual(actual, canonical(expected))) return { samples: sample + 1 };
      await wait(100);
    }
    assert.deepEqual(actual, canonical(expected), "exact natural native save after commit/history");
  }
  try {
    report.hashesBefore = await verifyHashes();
    report.nativeNodeMethods = await checked(() => {
      const node = [...app.workspace.activeLeaf.view.canvas.nodes.values()][0], methods = [];
      for (let prototype = node; prototype; prototype = Object.getPrototypeOf(prototype)) {
        for (const name of ["getData", "setData"]) {
          const method = Object.getOwnPropertyDescriptor(prototype, name)?.value;
          if (typeof method === "function") methods.push({ name, code: method.toString() });
        }
      }
      return methods;
    });
    assert.ok(report.nativeNodeMethods.some(method => method.name === "setData" && method.code.includes("Math.round")), "native normalization source required");
    saved = await checked(async () => { const file = app.workspace.getActiveFile(), canvas = app.workspace.activeLeaf.view.canvas;
      if (!file || !canvas) throw Error("existing Canvas required for safe restoration");
      return { path: file.path, text: await app.vault.read(file), viewport: { tx: canvas.tx, ty: canvas.ty, zoom: canvas.tZoom } }; });
    await checked(() => {
      if (window.__l20SelectionExtensions) throw Error("selection probe lease already occupied");
      const probe = { events: [], capture(event) {
        const session = app.plugins.plugins["miro-canvas"].m1Session;
        if (probe.events.length < 1000) probe.events.push({ type: event.type, trusted: event.isTrusted, pointerId: event.pointerId, pointerType: event.pointerType,
          x: event.clientX, y: event.clientY, target:event.target?.className, frame:Boolean(event.target?.closest?.('.miro-canvas-mixed-selection-frame')), board: Number.isFinite(event.clientX) ? session.boardPoint({ x: event.clientX, y: event.clientY }) : null });
      } };
      for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "keydown"]) window.addEventListener(type, probe.capture, true);
      window.__l20SelectionExtensions = probe;
    });
    probeOwned = true;
    for (const zoom of options.zoomLevel===undefined?[0.5, 1.25]:[options.zoomLevel]) for (const kind of options.caseName===undefined?cases:[options.caseName]) {
      const nonce = `${options.label}-${zoom}-${kind}-${Date.now()}`, board = fixture(nonce), file = `L20 selection extensions ${nonce}.canvas`;
      fixtureFile = file;
      await checked(async (file, board) => { const created = await app.vault.create(file, JSON.stringify(board)); await app.workspace.getLeaf(false).openFile(created, { active: true }); }, file, board);
      await wait(1100); const settlement = await settleScratch(file);
      let row = { zoom, kind, file, settlement, preparation: "native API selection/mask/viewport; scratch baseline settled through requestSave(false)", moves: [] };
      report.checks.push(row);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const prepared=await checked(prepare, kind, zoom, nonce); await wait(350);
        const before = await state(), persisted = await disk(), start = await checked(dragPoint), end = { x: start.x + 24, y: start.y + 16 };
        assert.equal(before.zoom, zoom,JSON.stringify(prepared)); assert.deepEqual(before.data.miroSource, board.miroSource);
        assert.deepEqual(canonical(JSON.parse(persisted)), canonical(before.data), "scratch settled baseline");
        for (const origin of ["local", "imported"]) assert.ok(before.pins[origin], "actual comment pin required");
        await input("down", start); await wait(70); await input("move", end); await wait(180);
        const preview = await state();
        if(!preview.preview||!preview.shift)row.failedGesture={start,end,prepared,beforeFrame:before.frame,afterFrame:preview.frame,events:preview.events};
        assert.ok(preview.preview && preview.shift, "trusted gesture must start the installed selection preview, no handler fallback");
        const down = preview.events.find(event => event.trusted && event.type === "pointerdown"), moves = preview.events.filter(event => event.trusted && event.type === "pointermove" && event.pointerId === down?.pointerId), moved = moves.at(-1);
        assert.equal(down?.frame,true,'trusted input must hit the actual mixed-selection frame');
        assert.ok(down?.board && moved?.board, "trusted native down/move witness required");
        assert.ok(Math.abs(preview.shift.dx - (moved.board.x - down.board.x)) < 0.001 && Math.abs(preview.shift.dy - (moved.board.y - down.board.y)) < 0.001, "preview follows trusted pointer delta");
        const expected = expectedMove(before.data, kind, preview.shift.dx, preview.shift.dy);
        assert.deepEqual(canonical(preview.preview), canonical(expected), "all unknown/source fields and intended positions before up");
        assert.deepEqual(canonical(preview.data), canonical(before.data), "preview must not mutate native document");
        assert.equal(preview.history, before.history); assert.equal(await disk(), persisted, "no preview persistence");
        assert.deepEqual(preview.masks, before.masks, "same captured endpoint mask before up");
        for (const id of ["native", "line"]) { assert.ok(before.paths[id] && preview.paths[id]); assert.notEqual(preview.paths[id], before.paths[id], "actual path follows before up"); }
        assert.notEqual(preview.paths.chain,before.paths.chain,'actual attached chain follows before up');
        for(const axis of ['x','y']){
          const delta=axis==='x'?preview.shift.dx:preview.shift.dy;
          assert.ok(Math.abs(preview.geometry.chain.start[axis]-before.geometry.chain.start[axis]-delta)<0.001,'chain start follows projected parent');
          assert.equal(preview.geometry.chain.end[axis],before.geometry.chain.end[axis],'unselected chain far end stays fixed');
        }
        for (const id of ["native", "line"]) {
          const first = before.geometry[id], current = preview.geometry[id];
          for (const axis of ["x", "y"]) {
            const delta = axis === "x" ? preview.shift.dx : preview.shift.dy;
            assert.ok(Math.abs(current.start[axis] - first.start[axis] - delta) < 0.001, "projected captured start");
            assert.ok(Math.abs(current.end[axis] - first.end[axis] - (kind === "whole-group" ? delta : 0)) < 0.001, "projected far-end mask");
          }
        }
        for (const origin of ["local", "imported"]) {
          assert.ok(Math.abs(preview.pins[origin].x - before.pins[origin].x - preview.shift.dx * zoom) < 1 && Math.abs(preview.pins[origin].y - before.pins[origin].y - preview.shift.dy * zoom) < 1, "actual comment pin follows before up");
        }
        const commitExpected = nativeCommit(expected);
        await input("up", end); await wait(900); const committed = await state();
        assert.equal(committed.preview, null); assert.equal(committed.history, before.history + 1);
        assert.deepEqual(canonical(committed.data), canonical(commitExpected));
        assert.deepEqual(committed.paths, committed.expectedPaths, "actual committed routes, with no preview document");
        const savedCommit = await awaitSaved(commitExpected);
        await tap('.miro-canvas-dock [data-icon="undo-2"]'); const undone = await state();
        assert.deepEqual(canonical(undone.data), canonical(before.data)); assert.deepEqual(undone.paths, before.paths);
        await awaitSaved(before.data);
        await tap('.miro-canvas-dock [data-icon="redo-2"]'); const redone = await state();
        assert.deepEqual(canonical(redone.data), canonical(commitExpected)); assert.deepEqual(redone.paths, redone.expectedPaths);
        assert.deepEqual(redone.paths, committed.paths); await awaitSaved(commitExpected);
        row.moves.push({ attempt, savedCommit, exactNativeRounding: true, committedPaths: committed.paths, delta: preview.shift, mask: before.masks, trusted: preview.events, previewPaths: preview.paths, projectedGeometry: preview.geometry, oneHistoryStep: true, undoRedo: true });
      }
      await checked(prepare, kind, zoom, nonce); await wait(350);
      const before = await state(), persisted = await disk(), start = await checked(dragPoint), end = { x: start.x + 24, y: start.y + 16 };
      await input("down", start); await wait(70); await input("move", end); await wait(180); const preview = await state();
      assert.ok(preview.preview && preview.events.some(event => event.trusted && event.type === "pointermove"), "cancel needs a real held preview");
      assert.deepEqual(canonical(preview.preview), canonical(expectedMove(before.data, kind, preview.shift.dx, preview.shift.dy)));
      assert.equal(preview.history, before.history); assert.equal(await disk(), persisted);
      if (options.serial) await input("cancel", end);
      else { await checked(file => { if (app.workspace.getActiveFile()?.path !== file) throw Error("scratch changed"); }, fixtureFile); await pressKey(client.send, "Escape"); await input("up", end); }
      await wait(500); const cancelled = await state();
      assert.ok(cancelled.events.some(event => event.trusted && event.type === (options.serial ? "pointercancel" : "keydown")), "trusted cancel input witness");
      assert.equal(cancelled.preview, null); assert.equal(cancelled.history, before.history); assert.equal(await disk(), persisted);
      assert.deepEqual(canonical(cancelled.data), canonical(before.data)); assert.deepEqual(cancelled.paths, before.paths);
      row.cancel = { passed: true, input: options.serial ? "actual ADB CANCEL" : "trusted CDP Escape/release", events: cancelled.events };
      console.log(`PASS ${options.label} ${kind} zoom=${zoom}: extensions/preview/commit/cancel/history`);
    }
    report.hashesAfter = await verifyHashes(); report.passed = true;
  } catch (error) { report.error = error.stack ?? String(error); throw error; }
  finally {
    try {
      if (held) {
        if (options.serial) await input("cancel", lastPoint);
        else { await checked(file => { if (app.workspace.getActiveFile()?.path !== file) throw Error("scratch changed"); }, fixtureFile); await pressKey(client.send, "Escape"); await input("up", lastPoint); }
      }
      if (probeOwned) await checked(file => { const probe = window.__l20SelectionExtensions;
        if (probe) for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "keydown"]) window.removeEventListener(type, probe.capture, true);
        delete window.__l20SelectionExtensions; if (app.workspace.getActiveFile()?.path === file) app.plugins.plugins["miro-canvas"].m1Session.resetTools(); }, fixtureFile);
      if (saved && fixtureFile) {
        await checked(async saved => { await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(saved.path), { active: true }); }, saved);
        await wait(600); await checked(saved => app.workspace.activeLeaf.view.canvas.setViewport(saved.viewport.tx, saved.viewport.ty, saved.viewport.zoom), saved);
        assert.equal(await checked(async saved => app.vault.read(app.vault.getAbstractFileByPath(saved.path)), saved), saved.text, "exact original board bytes; never overwrite them");
        report.originalRestored = { path: saved.path, originalSha256: hash(saved.text), exactBytes: true, viewport: saved.viewport };
      }
    } catch (error) { report.passed = false; report.restorationErrors.push(error.stack ?? String(error)); }
    mkdirSync(artifacts, { recursive: true });
    writeFileSync(path.join(artifacts, `selection-native-${options.label}.json`), JSON.stringify(report, null, 2).replace(/\n/g, "\r\n") + "\r\n"); client.close();
    if (report.restorationErrors.length) throw Error(report.restorationErrors.join("\n"));
  }
}
function checkFixture() {
  for (const kind of cases) {
    const before = fixture("offline"), untouched = clone(before), expected = expectedMove(before, kind, 20, 10);
    assert.deepEqual(before, untouched); assert.deepEqual(expected.miroSource, before.miroSource);
    const fractional = expectedMove(before, kind, 47.644439697265625, 32), committed = nativeCommit(fractional);
    assert.equal(committed.nodes.find(node => node.id === "a").x, 48);
    assert.deepEqual(committed.miroCanvas, fractional.miroCanvas); assert.deepEqual(committed.miroSource, fractional.miroSource);
    for (const node of fractional.nodes) { const normalized = committed.nodes.find(candidate => candidate.id === node.id); assert.deepEqual({ ...normalized, x: node.x, y: node.y }, node); }
    for (const point of [expected.miroCanvas.localOverrides.native.connector.waypoints[0], expected.miroCanvas.connectors.line.waypoints[0], expected.miroCanvas.localOverrides.native.connectorAnchors.from, expected.miroCanvas.connectors.line.from, expected.miroCanvas.commentPlaces["local:local"], expected.miroCanvas.commentPlaces["imported:imported"]]) assert.deepEqual(point.future, extra.future);
    if (kind === "captured-free-ends") { assert.deepEqual(expected.miroCanvas.localOverrides.native.connectorAnchors.to, before.miroCanvas.localOverrides.native.connectorAnchors.to); assert.deepEqual(expected.miroCanvas.connectors.line.waypoints, before.miroCanvas.connectors.line.waypoints); }
  }
  console.log("Offline fixture/oracle checks passed; no app/ADB/socket connection.");
}
const argv = process.argv.slice(2);
if (!argv.length || (argv.length === 1 && argv[0] === "--help")) console.log("Parent lease required. Prepare: --check-fixture. Run: --platform windows|android --port N --target EXACT-ID --main-sha FULL-SHA256 --css-sha FULL-SHA256 --label LABEL; Windows additionally --expected-vault ABSOLUTE-ISOLATED-VAULT; Android --serial SERIAL with existing PID forward/MiroCanvasTest/focus. No screenshots, foregrounding, OS input, build or deploy.");
else if (argv.length === 1 && argv[0] === "--check-fixture") checkFixture();
else run(argumentsOf(argv)).catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 1; });
