// Paint and lifecycle regression checks in an isolated desktop vault or MiroCanvasTest.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { connectByTitle, evaluate, pressKey } from "./cdp.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option("--port", "9336"));
const serial = option("--serial");
const android = fileURLToPath(new URL("./android.mjs", import.meta.url));
const { send, close } = await connectByTitle(port, serial ? "Obsidian" : undefined);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function checked(code) {
  const result = await evaluate(send, code);
  if (result?.error) throw new Error(result.error);
  return result;
}
async function tap(selector) {
  const point = await checked(`
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw Error('missing control');
    const rect = element.getBoundingClientRect();
    const point = {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    const hit = document.elementFromPoint(point.x, point.y);
    if (!element.contains(hit)) {
      throw Error('control obscured: ' + JSON.stringify({selector: ${JSON.stringify(selector)}, rect: rect.toJSON(), hit: hit?.outerHTML.slice(0, 400)}));
    }
    return point;
  `);
  if (serial) {
    execFileSync(process.execPath, [android, "tap", "--serial", serial, "--port", String(port), "--x", String(point.x), "--y", String(point.y)]);
  } else {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
  }
  await wait(300);
}

const board = {
  nodes: [
    { id: "opaque", type: "text", text: "Opaque card", x: 0, y: 0, width: 180, height: 110 },
    { id: "alpha", type: "text", text: "Translucent card", x: 240, y: 0, width: 180, height: 110 },
    { id: "clear", type: "text", text: "Transparent card", x: 480, y: 0, width: 180, height: 110 },
    { id: "shape", type: "text", text: "Shape", x: 0, y: 200, width: 180, height: 110 },
    { id: "text", type: "text", text: "Miro text", x: 240, y: 200, width: 180, height: 110 },
    { id: "sticky", type: "text", text: "Sticky note", x: 480, y: 200, width: 180, height: 110 },
  ],
  edges: [{ id: "line", fromNode: "opaque", fromSide: "right", toNode: "alpha", toSide: "left" }],
  miroCanvas: {
    schemaVersion: 1,
    localOverrides: {
      opaque: { colors: { fill: "#edeaf5", border: "#555555" }, borderWidth: 2, borderStyle: "dashed" },
      alpha: { colors: { fill: "#edeaf580", border: "#555555" } },
      clear: { colors: { fill: null, border: "#555555" } },
      shape: { shape: { kind: "rhombus", fallback: "text" }, colors: { fill: "#cfffc0" } },
      text: { item: { type: "text" }, colors: { fill: "#ffd9c0" } },
      sticky: { item: { type: "sticky_note", color: "yellow" } },
    },
  },
};
async function inspect() {
  return checked(`
    const canvas = app.workspace.activeLeaf.view.canvas;
    const result = {};
    const css = (element) => ({
      background: getComputedStyle(element).backgroundColor,
      border: getComputedStyle(element).border,
      radius: getComputedStyle(element).borderRadius,
      declaredBorderWidth: element.style.borderWidth,
    });
    for (const id of ['opaque', 'alpha', 'clear', 'shape', 'text', 'sticky']) {
      const shell = canvas.nodes.get(id).nodeEl;
      const face = shell.querySelector(':scope > .canvas-node-container');
      result[id] = {
        shell: css(shell),
        face: css(face),
        inner: [...shell.querySelectorAll('.canvas-node-content,.markdown-preview-view')].map(css),
        shape: shell.querySelector('.miro-source-decoration-shape path')?.getAttribute('fill'),
        sticky: shell.querySelector('.miro-source-decoration-sticky')?.style.backgroundColor,
      };
    }
    return result;
  `);
}

async function fitBoard() {
  await checked(`
    const canvas = app.workspace.activeLeaf.view.canvas;
    canvas.zoomToBbox({minX: -60, minY: -80, maxX: 740, maxY: 420});
    canvas.setViewport(canvas.tx, canvas.ty, canvas.tZoom);
    for (const node of canvas.nodes.values()) node.nodeEl.setAttribute('data-card-fill-check', node.id);
    return true;
  `);
  await wait(400);
}
function assertFaces(state) {
  for (const [id, fill] of [["opaque", "rgb(237, 234, 245)"], ["alpha", /^rgba\(237, 234, 245, 0\.5(?:02)?\)$/], ["clear", "rgba(0, 0, 0, 0)"]]) {
    assert.equal(state[id].shell.background, "rgba(0, 0, 0, 0)", `${id}: square shell must not paint`);
    if (fill instanceof RegExp) assert.match(state[id].face.background, fill, `${id}: native face fill`);
    else assert.equal(state[id].face.background, fill, `${id}: native face fill`);
    assert.equal(state[id].face.radius, "8px");
    for (const inner of state[id].inner) assert.equal(inner.background, "rgba(0, 0, 0, 0)", `${id}: fill must not stack`);
  }
  assert.match(state.opaque.face.border, /^[\d.]+px dashed /);
  assert.equal(state.opaque.face.declaredBorderWidth, "2px");
  assert.equal(state.shape.shape, "#cfffc0");
  assert.equal(state.shape.shell.background, "rgba(0, 0, 0, 0)");
  assert.equal(state.text.shell.background, "rgb(255, 217, 192)", "Miro text keeps its flat fill");
  assert.equal(state.sticky.sticky, "rgb(255, 232, 109)", "sticky note keeps its own face");
}

let saved;
try {
  saved = await checked(`
    const path = app.vault.adapter.getBasePath?.()?.replaceAll('\\\\', '/') ?? '';
    if (app.isMobile ? app.vault.getName() !== 'MiroCanvasTest' : !path.includes('/tools/obsidian_cdp/.out/')) {
      throw Error('test vault required');
    }
    return {file: app.workspace.getActiveFile()?.path, theme: app.vault.getConfig('theme'), leftCollapsed: app.workspace.leftSplit?.collapsed};
  `);
  const filename = `Card fill regression ${Date.now()}.canvas`;
  await checked(`
    const file = await app.vault.create(${JSON.stringify(filename)}, ${JSON.stringify(JSON.stringify(board))});
    await app.workspace.getLeaf(false).openFile(file, {active: true});
    if (!app.isMobile) app.workspace.leftSplit?.collapse();
    return true;
  `);
  await wait(600);
  await fitBoard();
  for (const theme of ["obsidian", "moonstone"]) {
    await checked(`
      app.changeTheme(${JSON.stringify(theme)});
      app.updateTheme();
      return true;
    `);
    await wait(250);
    assertFaces(await inspect());
    await tap('[data-card-fill-check="opaque"]');
    const selected = await checked(`return [...app.workspace.activeLeaf.view.canvas.selection].map(n=>n.id);`);
    assert.deepEqual(selected, ["opaque"]);
    assertFaces(await inspect());
    if (!serial) {
      await tap('.miro-canvas-toolbar__button--shape');
      await tap('.miro-canvas-toolbar__panel--shapes [data-shape="rhombus"]');
      const shape = await checked(`
        const shell = app.workspace.activeLeaf.view.canvas.nodes.get('opaque').nodeEl;
        return {kind: shell.getAttribute('data-miro-source-kind'), fill: shell.querySelector('.miro-source-decoration-shape path')?.getAttribute('fill')};
      `);
      assert.deepEqual(shape, { kind: "shape", fill: "#edeaf5" });
      await tap('.miro-canvas-dock__bar [data-icon="undo-2"]');
      await wait(400);
      assertFaces(await inspect());
      const point = await checked(`
        const rect = app.workspace.activeLeaf.view.canvas.nodes.get('opaque').nodeEl.getBoundingClientRect();
        return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
      `);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 2 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 2 });
      await wait(400);
      assert.equal(await checked(`return app.workspace.activeLeaf.view.canvas.nodes.get('opaque').isEditing;`), true);
      assertFaces(await inspect());
      await pressKey(send, "Escape");
      await tap('[data-card-fill-check="clear"]');
      await wait(300);
      assert.equal(await checked(`return app.workspace.activeLeaf.view.canvas.nodes.get('opaque').isEditing;`), false);
      assertFaces(await inspect());
    }
    console.log(`OK ${serial ?? "desktop"} ${theme}: one native face, selection, Miro text, shape and sticky fill`);
  }
  await checked(`
    await app.plugins.disablePlugin('miro-canvas');
    return true;
  `);
  const cleared = await checked(`
    const shell = app.workspace.activeLeaf.view.canvas.nodes.get('opaque').nodeEl;
    return [shell, ...shell.querySelectorAll('.canvas-node-container,.canvas-node-content,.markdown-preview-view')].map(element => element.style.backgroundColor);
  `);
  assert.ok(cleared.every((fill) => fill === ""), "unloading must restore native paint");
  await checked(`
    await app.plugins.enablePlugin('miro-canvas');
    return true;
  `);
  await wait(600);
  await fitBoard();
  assertFaces(await inspect());
  const metadata = await checked(`return app.workspace.activeLeaf.view.canvas.getData().miroCanvas.localOverrides;`);
  assert.deepEqual(metadata.opaque, board.miroCanvas.localOverrides.opaque);
  assert.equal(metadata.alpha.colors.fill, "#edeaf580");
  console.log(`OK ${serial ?? "desktop"}: reload preserves one face and saved colors`);
} finally {
  if (saved) {
    await checked(`
      if (!app.plugins.plugins['miro-canvas']) await app.plugins.enablePlugin('miro-canvas');
      app.changeTheme(${JSON.stringify(saved.theme)});
      app.updateTheme();
      const file = app.vault.getAbstractFileByPath(${JSON.stringify(saved.file ?? "")});
      if (file) await app.workspace.getLeaf(false).openFile(file, {active: true});
      if (!app.isMobile && ${saved.leftCollapsed === false}) app.workspace.leftSplit?.expand();
      return true;
    `);
  }
  close();
}
