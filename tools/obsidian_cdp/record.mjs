// Runs a scenario against the isolated Obsidian instance (launch.py) while
// screen-recording it over CDP, then turns the captured frames into a GIF.
//
//   node record.mjs --scenario scenarios/sticky-note.mjs --out ../../docs/media/en/sticky-note.gif
//   node record.mjs --scenario scenarios/sticky-note.mjs --out ../../docs/media/ru/sticky-note.gif --port 9336 --fps 8 --width 800
//
// See README.md for the scenario API (the `s` object a scenario receives)
// and for why some of this looks the way it does (separate settings window,
// captureScreenshot needing bringToFront, no OS cursor in screencast frames).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  listTargets, connectTarget, evaluate, pressKey, insertText,
} from "./cdp.mjs";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The recording's own DOM: a fake cursor (screencast frames never show the real OS one) and a caption banner. Idempotent - safe to call on every attach. */
const INJECT_OVERLAY_JS = `
  if (!document.getElementById('__cdp_overlay_style__')) {
    const style = document.createElement('style');
    style.id = '__cdp_overlay_style__';
    style.textContent = \`
      #__cdp_cursor__ { position:fixed; left:0; top:0; z-index:2147483647; width:18px; height:24px; pointer-events:none; filter:drop-shadow(0 1px 1px #000); }
      #__cdp_cursor__::before { content:''; position:absolute; inset:0; background:#fff; clip-path:polygon(0 0,0 85%,25% 65%,45% 100%,65% 90%,45% 57%,90% 57%); }
      #__cdp_cursor__.__cdp_click__::after { content:''; position:absolute; left:8px; top:8px; width:6px; height:6px; margin:-3px 0 0 -3px; border-radius:50%; background:rgba(255,80,80,.9); animation:__cdp_ripple__ .5s ease-out; }
      @keyframes __cdp_ripple__ { from { transform:scale(1); opacity:1; } to { transform:scale(5); opacity:0; } }
      body:has(.miro-canvas-exporting) :is(#__cdp_cursor__, #__cdp_caption__) { visibility:hidden !important; }
      #__cdp_caption__ { position:fixed; left:0; top:0; right:0; z-index:2147483647; box-sizing:border-box; padding:10px 18px; background:rgba(20,20,20,.85); color:#fff; font:600 20px/1.4 sans-serif; text-align:center; display:none; }
    \`;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = '__cdp_cursor__';
    const caption = document.createElement('div');
    caption.id = '__cdp_caption__';
    document.body.appendChild(cursor);
    document.body.appendChild(caption);
  }
  window.__cdpMoveCursor = (x, y, click) => {
    const el = document.getElementById('__cdp_cursor__');
    if (!el) return;
    el.style.transform = \`translate(\${x}px, \${y}px)\`;
    if (click) { el.classList.remove('__cdp_click__'); void el.offsetWidth; el.classList.add('__cdp_click__'); }
  };
  window.__cdpCaption = (text) => {
    const el = document.getElementById('__cdp_caption__');
    if (!el) return;
    if (text) { el.textContent = text; el.style.display = 'block'; }
    else { el.style.display = 'none'; }
  };
  return "overlay-ready";
`;

const REMOVE_OVERLAY_JS = `
  window.__cdpCaption && window.__cdpCaption("");
  document.getElementById('__cdp_cursor__')?.remove();
  document.getElementById('__cdp_caption__')?.remove();
  document.getElementById('__cdp_overlay_style__')?.remove();
  return "overlay-removed";
`;

/** One open CDP connection to a page target, plus this recording's bookkeeping for it. */
class WindowConnection {
  constructor(target, send, ws, unsubscribe) {
    this.target = target;
    this.send = send;
    this.ws = ws;
    this.unsubscribe = unsubscribe;
    this.recording = false;
    this.sessionId = null;
    this.cursor = null;
  }
}

class Recorder {
  constructor(port, frames) {
    this.port = port;
    this.frames = frames; // shared across every window this scenario visits
    this.connections = new Map(); // targetId -> WindowConnection
    this.current = null;
    this.mainTargetId = null;
  }

  async connectionFor(target) {
    const existing = this.connections.get(target.id);
    if (existing) return existing;
    const { send, ws, onEvent } = await connectTarget(target);
    const unsubscribe = onEvent((method, params) => {
      if (method !== "Page.screencastFrame") return;
      const connection = this.connections.get(target.id);
      if (connection) connection.sessionId = params.sessionId;
      // Timestamp is seconds since epoch (CDP's Page.ScreencastFrameMetadata);
      // frames_to_gif.py only needs the *differences* between them.
      const timestampMs = params.metadata.timestamp * 1000;
      if (connection?.recording && timestampMs >= connection.startedAt) {
        this.frames.push({ dataBase64: params.data, timestampMs });
      }
      // Ack without waiting - waiting would just delay the next frame.
      void send("Page.screencastFrameAck", { sessionId: params.sessionId });
    });
    const connection = new WindowConnection(target, send, ws, unsubscribe);
    this.connections.set(target.id, connection);
    await evaluate(send, INJECT_OVERLAY_JS);
    return connection;
  }

  async startScreencast(connection) {
    if (connection.recording) return;
    await connection.send("Page.bringToFront");
    connection.startedAt = Date.now();
    connection.recording = true;
    await connection.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  }

  async stopScreencast(connection) {
    if (!connection.recording) return;
    connection.recording = false;
    await connection.send("Page.stopScreencast");
  }

  /** Switches which window is recorded and receives input: stops the old screencast, starts the new one - the same open connections are kept, so switching back and forth is cheap. */
  async switchTo(target) {
    if (this.current) await this.stopScreencast(this.current);
    const connection = await this.connectionFor(target);
    await this.startScreencast(connection);
    this.current = connection;
    return connection;
  }

  async close() {
    for (const connection of this.connections.values()) {
      try {
        await this.stopScreencast(connection);
        await evaluate(connection.send, REMOVE_OVERLAY_JS);
      } catch {
        // The window may already be gone (a scenario closed it); nothing to clean up there.
      }
      connection.unsubscribe();
      connection.ws.close();
    }
  }
}

/** {x,y} | {selector} | {textEn, textRu[, selector, controlSelector]} -> a point in the current window, resolved through `find` in the last two cases. */
async function resolvePoint(recorder, target) {
  if (typeof target.x === "number" && typeof target.y === "number") return target;
  const found = await findElement(recorder, target);
  if (!found) throw new Error(`could not resolve a point for ${JSON.stringify(target)}`);
  return found;
}

/** Finds an element by CSS selector and/or by text (either language) - text changes with `--lang`, so a scenario that must run unchanged in both should prefer `selector`/`data-*` and use text only as a documented fallback. */
async function findElement(recorder, { selector = "*", textEn, textRu, controlSelector } = {}) {
  const wanted = [textEn, textRu].filter((text) => text !== undefined && text !== null);
  const code = `
    const wanted = ${JSON.stringify(wanted)};
    const controlSelector = ${JSON.stringify(controlSelector ?? null)};
    const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const match = nodes.find((el) => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || el.closest('[hidden]')) return false;
      if (wanted.length === 0) return true;
      const text = (el.textContent || "").trim();
      return wanted.some((want) => text === want || text.includes(want));
    });
    if (!match) return null;
    const scoped = controlSelector ? match.querySelector(controlSelector) : match;
    if (!scoped) return null;
    // Canvas places cards with transforms; scrolling them shifts the whole board.
    if (!scoped.closest(".canvas-wrapper")) scoped.scrollIntoView({ block: "center", inline: "center" });
    const rect = scoped.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), width: rect.width, height: rect.height };
  `;
  return evaluate(recorder.current.send, code);
}

async function moveCursor(recorder, x, y, click = false) {
  await evaluate(recorder.current.send, `window.__cdpMoveCursor(${x}, ${y}, ${click ? "true" : "false"}); return true;`);
  recorder.current.cursor = { x, y };
}

/** A visible approach to the next card or button, with a gentle start and stop. */
async function approach(recorder, target, duration = 0, buttons = 0) {
  const end = await resolvePoint(recorder, target);
  const start = recorder.current.cursor ?? end;
  const started = performance.now();
  let progress = 0;
  do {
    progress = duration > 0 ? Math.min(1, (performance.now() - started) / duration) : 1;
    const eased = progress * progress * (3 - 2 * progress);
    const x = start.x + (end.x - start.x) * eased;
    const y = start.y + (end.y - start.y) * eased;
    await moveCursor(recorder, x, y);
    await dispatchMouse(recorder, "mouseMoved", x, y, { buttons });
    if (progress < 1) await sleep(16);
  } while (progress < 1);
  return end;
}

async function dispatchMouse(recorder, type, x, y, extra = {}) {
  await recorder.current.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
}

/** Builds the `s` object a scenario's default export receives. */
function buildScenarioApi(recorder, lang) {
  return {
    lang,

    caption: async (text) => {
      const resolved = typeof text === "string" ? text : (lang === "ru" ? (text.ru ?? text.en) : (text.en ?? text.ru));
      await evaluate(recorder.current.send, `window.__cdpCaption(${JSON.stringify(resolved ?? "")}); return true;`);
    },

    find: (target) => findElement(recorder, target),

    click: async (target, { count = 1 } = {}) => {
      const { x, y } = await resolvePoint(recorder, target);
      await moveCursor(recorder, x, y);
      await dispatchMouse(recorder, "mouseMoved", x, y);
      await sleep(120);
      await dispatchMouse(recorder, "mousePressed", x, y, { clickCount: count });
      await moveCursor(recorder, x, y, true);
      await sleep(80);
      await dispatchMouse(recorder, "mouseReleased", x, y, { clickCount: count });
    },

    move: (target, { duration = 0 } = {}) => approach(recorder, target, duration),

    drag: async (from, to, { steps = 12, duration } = {}) => {
      const start = await resolvePoint(recorder, from);
      const end = await resolvePoint(recorder, to);
      await moveCursor(recorder, start.x, start.y);
      await dispatchMouse(recorder, "mouseMoved", start.x, start.y);
      await sleep(100);
      await dispatchMouse(recorder, "mousePressed", start.x, start.y);
      if (duration !== undefined) {
        await approach(recorder, end, duration, 1);
      } else for (let step = 1; step <= steps; step += 1) {
        const x = Math.round(start.x + (end.x - start.x) * (step / steps));
        const y = Math.round(start.y + (end.y - start.y) * (step / steps));
        await moveCursor(recorder, x, y);
        await dispatchMouse(recorder, "mouseMoved", x, y, { buttons: 1 });
        await sleep(30);
      }
      await dispatchMouse(recorder, "mouseReleased", end.x, end.y);
    },

    type: async (text, { interval = 0 } = {}) => {
      if (interval <= 0) return insertText(recorder.current.send, text);
      for (const character of text) {
        await insertText(recorder.current.send, character);
        await sleep(interval);
      }
    },
    key: (name, options) => pressKey(recorder.current.send, name, options),
    wait: (ms) => sleep(ms),
    eval: (code) => evaluate(recorder.current.send, code),

    /** Switches the recorded/controlled window by a title substring. Obsidian's own app name ("Obsidian") is not translated, but a window's own title text (e.g. "Settings -") is - prefer `openSettingsTab` for the settings window, which never needs a title at all. */
    window: async (titlePart) => {
      const targets = await listTargets(recorder.port);
      const target = targets.find((t) => t.type === "page" && t.title.includes(titlePart));
      if (!target) throw new Error(`no window with title including "${titlePart}"`);
      await recorder.switchTo(target);
    },

    /** Opens Settings on the given tab id (language-independent) and switches recording to that pop-out window, identified by diffing the target list rather than by its (localized) title. */
    openSettingsTab: async (id) => {
      const before = await listTargets(recorder.port);
      await evaluate(recorder.current.send, `
        app.setting.open();
        app.setting.openTabById(${JSON.stringify(id)});
        return true;
      `);
      let target = null;
      for (let attempt = 0; attempt < 20 && !target; attempt += 1) {
        await sleep(250);
        const after = await listTargets(recorder.port);
        target = after.find((t) => t.type === "page" && !before.some((b) => b.id === t.id));
      }
      if (!target) throw new Error("the Settings window never opened (openSettingsTab)");
      await recorder.switchTo(target);
    },

    /** Back to the window the scenario started in. */
    mainWindow: async () => {
      const targets = await listTargets(recorder.port);
      const target = targets.find((t) => t.id === recorder.mainTargetId);
      if (!target) throw new Error("the main window is no longer open");
      await recorder.switchTo(target);
    },

    /** Closes the Settings pop-out and resumes recording the main window - `app.setting` only exists in the main window's own context, so this runs the close there even if Settings is currently the recorded window. */
    closeSettings: async () => {
      const targets = await listTargets(recorder.port);
      const main = targets.find((t) => t.id === recorder.mainTargetId);
      if (!main) throw new Error("the main window is no longer open");
      const mainConnection = await recorder.connectionFor(main);
      await evaluate(mainConnection.send, "app.setting.close(); return true;");
      await recorder.switchTo(main);
    },
  };
}

async function runScenario(scenarioPath, port, outPath, fps, width) {
  const frames = [];
  const recorder = new Recorder(port, frames);
  const targets = await listTargets(port);
  const main = targets.find((t) => t.type === "page" && t.url.startsWith("app://obsidian.md"));
  if (!main) throw new Error("no Obsidian page target; is launch.py's instance running on this port?");
  recorder.mainTargetId = main.id;
  await recorder.switchTo(main);

  const lang = await evaluate(recorder.current.send, "return localStorage.getItem('language') || 'en';");
  const s = buildScenarioApi(recorder, lang);

  const scenarioModule = await import(pathToFileURL(path.resolve(scenarioPath)).href);
  try {
    if (scenarioModule.prepare) {
      await recorder.stopScreencast(recorder.current);
      await scenarioModule.prepare(s);
      frames.length = 0;
      const initialFrame = await recorder.current.send("Page.captureScreenshot", { format: "png" });
      if (initialFrame.result?.data) frames.push({ dataBase64: initialFrame.result.data, timestampMs: Date.now() });
      await recorder.startScreencast(recorder.current);
    }
    await scenarioModule.default(s);
    // A still page sends no screencast frames. Keep the final reading pause.
    const finalFrame = await recorder.current.send("Page.captureScreenshot", { format: "png" });
    if (finalFrame.result?.data) frames.push({ dataBase64: finalFrame.result.data, timestampMs: Date.now() });
  } finally {
    try {
      await scenarioModule.cleanup?.(s);
    } finally {
      await recorder.close();
    }
  }

  if (frames.length === 0) throw new Error("no frames were captured; the scenario ran but nothing was recorded");
  writeGif(frames, outPath, fps, width);
}

function writeGif(frames, outPath, fps, width) {
  const workDir = mkdtempSync(path.join(tmpdir(), "obsidian-cdp-frames-"));
  try {
    const manifestFrames = frames.map((frame, index) => {
      const file = `frame-${String(index).padStart(5, "0")}.png`;
      writeFileSync(path.join(workDir, file), Buffer.from(frame.dataBase64, "base64"));
      return { file, t: frame.timestampMs };
    });
    const manifestPath = path.join(workDir, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({ frames: manifestFrames }, null, 2));

    mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    const python = process.platform === "win32" ? "python" : "python3";
    const result = spawnSync(python, [
      path.join(TOOL_DIR, "frames_to_gif.py"),
      "--manifest", manifestPath,
      "--out", path.resolve(outPath),
      "--width", String(width),
      "--fps", String(fps),
    ], { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`frames_to_gif.py failed with exit code ${result.status}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = { port: 9333, fps: 10, width: 960 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--scenario") args.scenario = argv[++i];
    else if (flag === "--out") args.out = argv[++i];
    else if (flag === "--port") args.port = Number(argv[++i]);
    else if (flag === "--fps") args.fps = Number(argv[++i]);
    else if (flag === "--width") args.width = Number(argv[++i]);
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!args.scenario || !args.out) throw new Error("usage: node record.mjs --scenario <file.mjs> --out <file.gif> [--port 9333] [--fps 10] [--width 960]");
  return args;
}

const args = parseArgs(process.argv.slice(2));
await runScenario(args.scenario, args.port, args.out, args.fps, args.width);
console.log(`saved ${args.out}`);
