// Check native color formats with real input in an isolated Obsidian test vault.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { connectByTitle, evaluate } from "./cdp.mjs";

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
const cases = [
  { id: "native" },
  { id: "straight", connector: { route: "straight" } },
  { id: "elbowed", connector: { route: "elbowed" } },
  { id: "curved", connector: { route: "curved" } },
  { id: "open", connector: { route: "straight", endCap: "arrow" } },
  { id: "block", connector: { route: "straight", block: true, width: 12 } },
  { id: "preset", color: "1", connector: { route: "straight" } },
  { id: "explicit", connector: { route: "straight", color: "#2385d7" } },
];
const board = { nodes: [], edges: [], miroCanvas: { schemaVersion: 1, localOverrides: {} } };
for (const [index, item] of cases.entries()) {
  const y = index * 250;
  for (const [suffix, x] of [["a", 0], ["b", 380]]) {
    board.nodes.push({ id: `${item.id}-${suffix}`, type: "text", text: item.id, x, y, width: 180, height: 100 });
  }
  board.edges.push({ id: item.id, fromNode: `${item.id}-a`, fromSide: "right", toNode: `${item.id}-b`, toSide: "left", ...(item.color ? { color: item.color } : {}) });
  if (item.connector) board.miroCanvas.localOverrides[item.id] = { connector: item.connector };
}
async function fit(index) {
  await checked(`
    const canvas = app.workspace.activeLeaf.view.canvas;
    const y = ${index * 250};
    canvas.zoomToBbox({minX: -40, minY: y - 100, maxX: 600, maxY: y + 200});
    canvas.setViewport(canvas.tx, canvas.ty, canvas.tZoom);
    return true;
  `);
  await wait(350);
}
async function inspect(id) {
  return checked(`
    const edge = app.workspace.activeLeaf.view.canvas.edges.get(${JSON.stringify(id)});
    const path = edge.lineGroupEl.querySelector('.canvas-display-path');
    const css = getComputedStyle(path);
    const cap = edge.lineGroupEl.querySelector('marker path');
    const nativeCap = edge.lineEndGroupEl?.querySelector('.canvas-path-end');
    const head = cap ?? nativeCap;
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM());
    return {stroke: css.stroke, fill: css.fill, opacity: css.strokeOpacity,
      cap: head ? {stroke: getComputedStyle(head).stroke, fill: getComputedStyle(head).fill} : null,
      point: {x: point.x, y: point.y}, declared: path.style.stroke};
  `);
}
function assertPaint(state, item) {
  assert.notEqual(state.stroke, "none", `${item.id}: missing stroke`);
  assert.notEqual(state.stroke, "rgba(0, 0, 0, 0)", `${item.id}: transparent stroke`);
  assert.equal(state.opacity, "1");
  if (item.id === "block") assert.equal(state.fill, state.stroke);
  else {
    assert.ok(state.cap, `${item.id}: missing arrowhead`);
    if (item.id === "open") assert.equal(state.cap.stroke, state.stroke);
    else assert.equal(state.cap.fill, state.stroke);
  }
  if (item.id === "explicit") assert.equal(state.stroke, "rgb(35, 133, 215)");
}
async function tap(point) {
  if (serial) {
    execFileSync(process.execPath, [android, "tap", "--serial", serial, "--port", String(port), "--x", String(point.x), "--y", String(point.y)]);
  } else {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
  }
  await wait(250);
}
let saved;
try {
  saved = await checked(`
    const path = app.vault.adapter.getBasePath?.()?.replaceAll('\\\\', '/') ?? '';
    if (app.isMobile ? app.vault.getName() !== 'MiroCanvasTest' : !path.includes('/tools/obsidian_cdp/.out/')) throw Error('test vault required');
    return {file: app.workspace.getActiveFile()?.path, theme: app.vault.getConfig('theme'), leftCollapsed: app.workspace.leftSplit?.collapsed};
  `);
  await checked(`
    const file = await app.vault.create(${JSON.stringify(`Arrow color regression ${Date.now()}.canvas`)}, ${JSON.stringify(JSON.stringify(board))});
    await app.workspace.getLeaf(false).openFile(file, {active: true});
    if (!app.isMobile) app.workspace.leftSplit?.collapse();
    return true;
  `);
  await wait(600);
  for (const theme of ["obsidian", "moonstone"]) {
    await checked(`app.changeTheme(${JSON.stringify(theme)}); app.updateTheme(); return true;`);
    await wait(250);
    for (const [index, item] of cases.entries()) {
      await fit(index);
      const state = await inspect(item.id);
      assertPaint(state, item);
      await tap(state.point);
      const selected = await checked(`return [...app.workspace.activeLeaf.view.canvas.selection].map(item => item.id);`);
      assert.deepEqual(selected, [item.id]);
      assertPaint(await inspect(item.id), item);
    }
    console.log(`OK ${serial ?? "desktop"} ${theme}: default/preset/explicit color, all routes, open and block arrows, real selection`);
  }
  await checked(`await app.plugins.disablePlugin('miro-canvas'); await app.plugins.enablePlugin('miro-canvas'); return true;`);
  await wait(600);
  for (const [index, item] of cases.entries()) {
    await fit(index);
    assertPaint(await inspect(item.id), item);
  }
  const data = await checked(`return JSON.parse(app.workspace.activeLeaf.view.getViewData());`);
  assert.deepEqual(data.edges, board.edges, "rendering must not assign a color to the board");
  assert.deepEqual(data.miroCanvas.localOverrides, board.miroCanvas.localOverrides);
  console.log(`OK ${serial ?? "desktop"}: plugin reload, no persisted color changes`);
} finally {
  if (saved) await checked(`
    if (!app.plugins.plugins['miro-canvas']) await app.plugins.enablePlugin('miro-canvas');
    app.changeTheme(${JSON.stringify(saved.theme)});
    app.updateTheme();
    const file = app.vault.getAbstractFileByPath(${JSON.stringify(saved.file ?? "")});
    if (file) await app.workspace.getLeaf(false).openFile(file, {active: true});
    if (!app.isMobile && ${saved.leftCollapsed === false}) app.workspace.leftSplit?.expand();
    return true;
  `);
  close();
}
