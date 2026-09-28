// Times a real drag on a large board in a running, isolated Obsidian (see
// ../README.md, "Benchmarking a drag").  For each board, selection size and
// plugin state it opens a fresh copy of the board, selects the first K cards
// with native Canvas's own `select`, fits them in view (`zoomToBbox`, or a
// fixed `--zoom`), presses on the first selected card, sends real
// `Input.dispatchMouseEvent` moves a few milliseconds apart, lets go, and logs
// every animation frame meanwhile.  It prints the frame times during the drag
// and in the settle time after it (median and 95th percentile).
//
//   node tools/obsidian_cdp/bench/measure-drag.mjs --port 9338 \
//     --board tools/obsidian_cdp/.out/bench/board-5000.canvas --select 1,50,500,all --plugin on,off
//
// Options:
//   --port <n>          CDP port of the instance to drive (required; never 9333-9335 unless yours)
//   --board <file>      a board from generate-board.mjs; repeat for several
//   --select <list>     comma-separated selection sizes; "all" is every card (default 1,50,500,all)
//   --plugin <list>     on, off or both (default on,off)
//   --moves <n>         pointer moves in the drag (default 60)
//   --interval <ms>     pause between moves (default 15)
//   --settle <ms>       frames logged after letting go (default 1500)
//   --zoom <z>          show the first selected card at this zoom instead of fitting the selection
//   --shots <dir>       screenshots mid-drag and after it, for checking by eye
//   --label <text>      a name for this build in the output (e.g. before, after)
//   --json <file>       also append every result as one JSON line to this file
//   --profile <dir>     also record a CPU profile of each drag (.cpuprofile, for DevTools)
//
// The copies are written into the running vault's bench/ folder; nothing is
// deleted and nothing outside that isolated vault is touched.
import { appendFileSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { connectTarget, evaluate, listTargets, pickTarget, screenshot } from "../cdp.mjs";

const PLUGIN_ID = "miro-canvas";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function parseArgs(argv) {
  const options = {
    port: undefined, boards: [], select: ["1", "50", "500", "all"], plugin: ["on", "off"],
    moves: 60, interval: 15, settle: 1500, zoom: undefined, shots: undefined, label: "", json: undefined, profile: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    index += 1;
    if (name === "--port") options.port = Number.parseInt(value, 10);
    else if (name === "--board") options.boards.push(resolve(value));
    else if (name === "--select") options.select = value.split(",");
    else if (name === "--plugin") options.plugin = value.split(",");
    else if (name === "--moves") options.moves = Number.parseInt(value, 10);
    else if (name === "--interval") options.interval = Number.parseInt(value, 10);
    else if (name === "--settle") options.settle = Number.parseInt(value, 10);
    else if (name === "--zoom") options.zoom = Number.parseFloat(value);
    else if (name === "--shots") options.shots = resolve(value);
    else if (name === "--label") options.label = value;
    else if (name === "--json") options.json = resolve(value);
    else if (name === "--profile") options.profile = resolve(value);
    else throw new Error(`unknown option ${name}`);
  }
  if (!Number.isSafeInteger(options.port)) throw new Error("--port is required");
  if (options.boards.length === 0) throw new Error("--board is required");
  return options;
}

async function page(send, code) {
  const value = await evaluate(send, code);
  if (value !== null && typeof value === "object" && "error" in value) throw new Error(String(value.error));
  return value;
}

async function setPlugin(send, on) {
  await page(send, `
    // Loaded, not listed: disablePlugin unloads the plugin but may leave it in enabledPlugins.
    const loaded = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}] !== undefined;
    if (${on} && !loaded) await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
    if (!${on} && loaded) await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
    if ((app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}] !== undefined) !== ${on}) {
      throw new Error("could not turn the plugin ${on ? "on" : "off"}");
    }
    // The plugin's first-run question, if a fresh vault asks it, is answered
    // with its last button ("Not now"), whatever the interface language.
    for (let tries = 0; tries < 20; tries += 1) {
      const buttons = document.querySelectorAll(".miro-canvas-import-question-modal button");
      if (buttons.length > 0) {
        buttons[buttons.length - 1].click();
        break;
      }
      if (!${on}) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    return true;`);
}

/** Copies the board into the vault under a new name and opens it; resolves once every card is on the board. */
async function openBoard(send, boardFile, runName) {
  const vaultPath = await page(send, "return app.vault.adapter.basePath;");
  mkdirSync(join(vaultPath, "bench"), { recursive: true });
  const inVault = `bench/${runName}.canvas`;
  copyFileSync(boardFile, join(vaultPath, inVault));
  return page(send, `
    const earlier = app.workspace.getLeavesOfType("canvas");
    let file;
    for (let tries = 0; tries < 200 && !file; tries += 1) {
      file = app.vault.getAbstractFileByPath(${JSON.stringify(inVault)});
      if (!file) await new Promise((done) => setTimeout(done, 50));
    }
    if (!file) throw new Error("the vault never saw ${inVault}");
    // A new tab first, then the earlier boards closed: an empty workspace has no tab to open into.
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file);
    for (const other of earlier) if (other !== leaf) other.detach();
    app.workspace.setActiveLeaf(leaf, { focus: true });
    const canvas = leaf.view.canvas;
    let count = 0;
    for (let tries = 0; tries < 400; tries += 1) {
      count = canvas.nodes.size;
      if (count > 0 && canvas.data.nodes.length === count) break;
      await new Promise((done) => setTimeout(done, 50));
    }
    return { nodes: canvas.nodes.size, edges: canvas.edges.size };`);
}

/** Selects the first K cards (frames excluded), shows them, and returns where to press. */
async function selectCards(send, size, zoom, plugin) {
  return page(send, `
    const canvas = app.workspace.activeLeaf.view.canvas;
    canvas.deselectAll();
    const cards = [...canvas.nodes.values()].filter((node) => node.getData().type !== "group");
    const chosen = ${size === "all" ? "cards" : `cards.slice(0, ${Number(size)})`};
    for (const node of chosen) canvas.select(node);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of chosen) {
      minX = Math.min(minX, node.x); minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width); maxY = Math.max(maxY, node.y + node.height);
    }
    // A board just opened may not have measured its own size yet, and
    // zoomToBbox does nothing until it has.
    for (let tries = 0; tries < 100 && !(canvas.canvasRect?.width > 0); tries += 1) {
      await new Promise((done) => setTimeout(done, 50));
    }
    ${zoom === undefined
      ? "canvas.zoomToBbox({ minX, minY, maxX, maxY });"
      : `canvas.setViewport(chosen[0].x + chosen[0].width / 2, chosen[0].y + chosen[0].height / 2, Math.log2(${zoom}));`}
    // zoomToBbox only sets where the view is going; setViewport puts it there at once.
    canvas.setViewport(canvas.tx, canvas.ty, canvas.tZoom);
    // The view is drawn there on the next frames, and native Canvas puts
    // cards on the page only once they are in view: wait until the first card
    // is on the page and has stopped moving.
    const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
    let last = "";
    for (let steady = 0, tries = 0; steady < 5 && tries < 300; tries += 1) {
      await frame();
      await new Promise((done) => setTimeout(done, 50));
      const box = chosen[0].nodeEl.getBoundingClientRect();
      const now = [box.left, box.top, box.width].join(",");
      steady = box.width > 0 && now === last ? steady + 1 : 0;
      last = now;
    }
    // Pressed on the first selected card with a point on screen that no line
    // or other card covers (zoomed far out, a line's hit area can hide a
    // card's middle), just as a person presses on a card to drag the
    // selection.  With the plugin on, several selected items lie under the
    // plugin's own frame, and a press there moves them all: the frame is
    // waited for, so every run of a build takes the same path.
    const wantFrame = ${plugin === "on"} && chosen.length > 1;
    const pressable = (node, hit) => hit !== null && (wantFrame
      ? hit.closest(".miro-canvas-mixed-selection-frame") !== null
      : node.nodeEl.contains(hit));
    let first, point;
    for (let tries = 0; tries < 50 && first === undefined; tries += 1) {
      if (tries > 0) await new Promise((done) => setTimeout(done, 100));
      for (const node of chosen.slice(0, 500)) {
        const box = node.nodeEl.getBoundingClientRect();
        if (box.width === 0) continue;
        for (const [across, down] of [[0.5, 0.5], [0.3, 0.5], [0.5, 0.3], [0.3, 0.3], [0.7, 0.7], [0.2, 0.8], [0.5, 0.8]]) {
          const x = box.left + (box.right - box.left) * across;
          const y = box.top + (box.bottom - box.top) * down;
          if (pressable(node, document.elementFromPoint(x, y))) {
            point = { x, y };
            break;
          }
        }
        if (point !== undefined) {
          first = node;
          break;
        }
      }
    }
    if (first === undefined) {
      const box = chosen[0].nodeEl.getBoundingClientRect();
      const stack = document.elementsFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2)
        .slice(0, 4).map((element) => element.tagName + "." + (element.getAttribute("class") ?? ""));
      throw new Error("no selected card can be pressed on screen; over the first: " + stack.join(" > ")
        + "; view " + JSON.stringify([canvas.x, canvas.y, canvas.zoom, canvas.tx, canvas.ty, canvas.tZoom, canvas.canvasRect, box, app.workspace.activeLeaf.view.file?.path]));
    }
    return {
      selected: canvas.selection.size,
      zoom: canvas.scale ?? Math.pow(2, canvas.zoom),
      x: point.x, y: point.y,
      firstId: first.id, before: { x: first.x, y: first.y },
    };`);
}

/** Starts logging animation frames and the press and release times. */
async function startFrameLog(send) {
  await page(send, `
    const log = { frames: [], down: undefined, up: undefined, running: true };
    window.__miroBenchLog = log;
    const tick = (time) => { log.frames.push(time); if (log.running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.addEventListener("pointerdown", () => { log.down ??= performance.now(); }, { capture: true, once: true });
    window.addEventListener("pointerup", () => { log.up ??= performance.now(); }, { capture: true, once: true });
    return true;`);
}

async function stopFrameLog(send, settle) {
  return page(send, `
    const log = window.__miroBenchLog;
    log.running = false;
    const drag = [], after = [];
    for (let index = 1; index < log.frames.length; index += 1) {
      const end = log.frames[index];
      const length = end - log.frames[index - 1];
      if (log.down !== undefined && log.up !== undefined && end > log.down && end <= log.up) drag.push(length);
      else if (log.up !== undefined && end > log.up && end <= log.up + ${settle}) after.push(length);
    }
    return { drag, after, dragTime: (log.up ?? 0) - (log.down ?? 0) };`);
}

function stats(values) {
  if (values.length === 0) return { median: NaN, p95: NaN, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(share * (sorted.length - 1) + 0.5))];
  return { median: at(0.5), p95: at(0.95), count: sorted.length };
}

async function mouse(send, type, x, y, buttons) {
  await send("Input.dispatchMouseEvent", {
    type, x, y, button: "left", buttons, clickCount: type === "mouseMoved" ? 0 : 1, pointerType: "mouse",
  });
}

async function drag(send, options, at, shotName) {
  await mouse(send, "mouseMoved", at.x, at.y, 0);
  await mouse(send, "mousePressed", at.x, at.y, 1);
  let x = at.x;
  let y = at.y;
  for (let move = 0; move < options.moves; move += 1) {
    x += 4;
    y += 2;
    await mouse(send, "mouseMoved", x, y, 1);
    if (shotName !== undefined && move === Math.floor(options.moves / 2)) {
      writeFileSync(join(options.shots, `${shotName}-during.png`), await screenshot(send));
    }
    await sleep(options.interval);
  }
  await mouse(send, "mouseReleased", x, y, 0);
}

async function runOne(send, options, boardFile, size, plugin, runIndex) {
  const board = basename(boardFile, ".canvas");
  const runName = `${board}-${options.label || "run"}-${plugin}-${size}-${Date.now()}-${runIndex}`;
  // Timed only in a window on screen: a covered one may stop drawing.
  await send("Page.bringToFront");
  await setPlugin(send, plugin === "on");
  const opened = await openBoard(send, boardFile, runName);
  // Let the plugin (when on) mount and settle before anything is timed.
  await sleep(2500);
  const at = await selectCards(send, size, options.zoom, plugin);
  await sleep(500);
  const shotName = options.shots === undefined ? undefined : `${board}-${plugin}-${size}${options.zoom === undefined ? "" : `-zoom${options.zoom}`}`;
  if (shotName !== undefined) {
    mkdirSync(options.shots, { recursive: true });
    writeFileSync(join(options.shots, `${shotName}-before.png`), await screenshot(send));
  }
  const visible = await page(send, "return document.visibilityState;");
  // The plugin draws its overlays on a board it has taken on; none means it is off.
  const overlays = await page(send, `return app.workspace.activeLeaf.view.containerEl.querySelectorAll("[class*=miro-canvas]").length;`);
  if ((overlays > 0) !== (plugin === "on")) throw new Error(`plugin ${plugin}, but ${overlays} of its elements are on the board`);
  if (options.profile !== undefined) {
    await send("Profiler.enable");
    await send("Profiler.start");
  }
  await startFrameLog(send);
  await drag(send, options, at, shotName);
  if (options.profile !== undefined) {
    const { result } = await send("Profiler.stop");
    mkdirSync(options.profile, { recursive: true });
    writeFileSync(join(options.profile, `${runName}.cpuprofile`), JSON.stringify(result.profile));
  }
  await sleep(options.settle + 100);
  const frames = await stopFrameLog(send, options.settle);
  const moved = await page(send, `
    const node = app.workspace.activeLeaf.view.canvas.nodes.get(${JSON.stringify(at.firstId)});
    // A drag that did not take often says why in a notice, shown for a few seconds.
    const notices = [...document.querySelectorAll(".notice")].map((notice) => notice.innerText);
    // A large move may still be written after the settle time: wait for it a while.
    for (let tries = 0; tries < 100 && node.x === ${at.before.x} && node.y === ${at.before.y}; tries += 1) {
      await new Promise((done) => setTimeout(done, 100));
    }
    return { x: node.x, y: node.y, notices };`);
  if (shotName !== undefined) writeFileSync(join(options.shots, `${shotName}-after.png`), await screenshot(send));
  const result = {
    label: options.label, board, nodes: opened.nodes, edges: opened.edges, selection: size, selected: at.selected,
    plugin, zoom: Math.round(at.zoom * 1000) / 1000, visible,
    moved: { dx: moved.x - at.before.x, dy: moved.y - at.before.y },
    ...(moved.notices.length > 0 ? { notices: moved.notices } : {}),
    dragMs: Math.round(frames.dragTime),
    // Each move waits for the page to take it, so a slow drag shows here
    // even when idle frames between moves keep the median frame short.
    perMoveMs: Math.round((frames.dragTime / options.moves) * 10) / 10,
    drag: stats(frames.drag), settle: stats(frames.after),
  };
  await page(send, `app.workspace.activeLeaf.view.canvas.deselectAll(); return true;`);
  return result;
}

function row(result) {
  const number = (value) => (Number.isFinite(value) ? value.toFixed(1) : "-");
  return `| ${result.label} | ${result.board} | ${result.selection} (${result.selected}) | ${result.plugin} | ${result.zoom} `
    + `| ${number(result.perMoveMs)} | ${number(result.drag.median)} | ${number(result.drag.p95)} | ${result.drag.count} `
    + `| ${number(result.settle.median)} | ${number(result.settle.p95)} | ${result.moved.dx},${result.moved.dy} |`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = pickTarget(await listTargets(options.port));
  const { send, close } = await connectTarget(target);
  const results = [];
  // A window covered by other windows counts as hidden, and Chromium then
  // stops its animation frames: nothing would be timed, and the view would
  // never finish moving.  Electron can keep it running.
  await page(send, `
    const remote = window.electron?.remote ?? require("@electron/remote");
    remote.getCurrentWebContents().setBackgroundThrottling(false);
    return true;`);
  // Off first, so the first run with it on loads the main.js now in the vault
  // (swapped in to time another build) rather than the one already running.
  await setPlugin(send, false);
  try {
    let runIndex = 0;
    for (const boardFile of options.boards) {
      for (const size of options.select) {
        for (const plugin of options.plugin) {
          runIndex += 1;
          const result = await runOne(send, options, boardFile, size, plugin, runIndex);
          results.push(result);
          console.log(JSON.stringify(result));
          if (options.json !== undefined) appendFileSync(options.json, `${JSON.stringify(result)}\n`);
        }
      }
    }
  } finally {
    await setPlugin(send, true).catch(() => undefined);
    close();
  }
  console.log("");
  console.log("| build | board | selection | plugin | zoom | ms per move | drag median ms | drag p95 ms | frames | settle median ms | settle p95 ms | moved |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const result of results) console.log(row(result));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
