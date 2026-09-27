// A small Chrome DevTools Protocol client for the isolated Obsidian CDP
// harness (see README.md).  Used two ways:
//
//   node cdp.mjs eval "<expression>"        run in the main window, or the
//   node cdp.mjs evalfile <file.js>         window CDP_TITLE picks
//   node cdp.mjs shot <out.png> [x y w h]   screenshot (optional clip)
//   node cdp.mjs mouse '<json>'             Input.dispatchMouseEvent steps
//   node cdp.mjs key <name>                 one key press (see KEY_TABLE)
//   node cdp.mjs type "<text>"              Input.insertText into focus
//   node cdp.mjs raw <Method.name> '<json>' any CDP command, for debugging
//
// record.mjs imports the functions below directly instead of shelling out.
// Every command needs CDP_PORT (default 9333); CDP_TITLE narrows the page
// picked when a vault has more than one window open (the settings pop-out,
// the community plugin browser - see README's "separate windows" note).
import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_PORT = 9333;

/** The isolated Obsidian instance's open CDP page targets (tabs/windows). */
export async function listTargets(port = DEFAULT_PORT) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) throw new Error(`CDP target list failed: HTTP ${response.status}`);
  return response.json();
}

/** The one page target this CLI/scenario should talk to right now. */
export function pickTarget(targets, titleFilter) {
  const page = targets.find((t) => t.type === "page"
    && (titleFilter ? t.title.includes(titleFilter) : t.url.startsWith("app://obsidian.md")));
  if (!page) {
    throw new Error(titleFilter
      ? `no CDP page target with title including "${titleFilter}"`
      : "no Obsidian page target (app://obsidian.md)");
  }
  return page;
}

/** One open WebSocket session against a CDP page target, with request/response matching. */
export async function connectTarget(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error(`could not open CDP socket for ${target.title}`));
  });
  let nextId = 1;
  const pending = new Map();
  const eventListeners = new Set();
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    } else if (data.method) {
      for (const listener of eventListeners) listener(data.method, data.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const onEvent = (listener) => { eventListeners.add(listener); return () => eventListeners.delete(listener); };
  const close = () => ws.close();
  return { ws, send, onEvent, close, target };
}

/** Connects to whichever page CDP_TITLE (or the default main-window rule) selects. */
export async function connectByTitle(port = DEFAULT_PORT, titleFilter = process.env.CDP_TITLE) {
  const targets = await listTargets(port);
  return connectTarget(pickTarget(targets, titleFilter));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `expression`'s statements inside `(async () => { ... })()` and returns its value, or `{error}` on a thrown exception. */
export async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  // A reload under a running evaluation ("Execution context was destroyed")
  // comes back as a protocol error, not an exception; report it the same way.
  if (result.error) {
    return { error: result.error.message ?? JSON.stringify(result.error) };
  }
  if (result.result?.exceptionDetails) {
    return { error: result.result.exceptionDetails.exception?.description ?? result.result.exceptionDetails.text };
  }
  return result.result?.result?.value;
}

/** Page.captureScreenshot needs the target in front first, or it can hang indefinitely. */
export async function screenshot(send, { clip, format = "png" } = {}) {
  const params = { format };
  if (clip) params.clip = { ...clip, scale: clip.scale ?? 1 };
  await send("Page.bringToFront");
  const result = await Promise.race([
    send("Page.captureScreenshot", params),
    sleep(15000).then(() => { throw new Error("screenshot timed out (Page.bringToFront may not have run)"); }),
  ]);
  return Buffer.from(result.result.data, "base64");
}

/** name -> {key, code, windowsVirtualKeyCode[, text]} for Input.dispatchKeyEvent. Covers the letters/keys the example scenarios need; extend as needed. */
export const KEY_TABLE = {
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  Delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
  Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
};

/** A single letter or digit's key event fields - the board's tool hotkeys (N, T, V, S, ...) are all one character. */
function charKeyEvent(char) {
  const upper = char.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return { key: char, code: `Key${upper}`, windowsVirtualKeyCode: upper.charCodeAt(0), text: char };
  if (/^[0-9]$/.test(upper)) return { key: char, code: `Digit${upper}`, windowsVirtualKeyCode: upper.charCodeAt(0), text: char };
  throw new Error(`no key mapping for "${char}"; add it to KEY_TABLE in cdp.mjs`);
}

/** Presses (keyDown + keyUp) one named key (KEY_TABLE) or one letter/digit. */
export async function pressKey(send, name) {
  const fields = KEY_TABLE[name] ?? charKeyEvent(name);
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...fields });
  if (fields.text) await send("Input.dispatchKeyEvent", { type: "char", ...fields });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...fields });
}

/** Types `text` into whatever has focus, as one native input - not a per-character key sequence. */
export async function insertText(send, text) {
  await send("Input.insertText", { text });
}

async function main() {
  const port = Number(process.env.CDP_PORT ?? DEFAULT_PORT);
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error("usage: node cdp.mjs <eval|evalfile|shot|mouse|key|type|raw> ...");
  const { send, close } = await connectByTitle(port);
  try {
    if (command === "eval") {
      console.log(JSON.stringify(await evaluate(send, args[0]), null, 1));
    } else if (command === "evalfile") {
      console.log(JSON.stringify(await evaluate(send, readFileSync(args[0], "utf8")), null, 1));
    } else if (command === "shot") {
      const [out, x, y, w, h] = args;
      const clip = w !== undefined ? { x: Number(x), y: Number(y), width: Number(w), height: Number(h) } : undefined;
      writeFileSync(out, await screenshot(send, { clip }));
      console.log(`saved ${out}`);
    } else if (command === "raw") {
      console.log(JSON.stringify(await send(args[0], JSON.parse(args[1] ?? "{}"))));
    } else if (command === "mouse") {
      for (const step of JSON.parse(args[0])) {
        if (step.wait) { await sleep(step.wait); continue; }
        await send("Input.dispatchMouseEvent", step);
      }
      console.log("mouse done");
    } else if (command === "key") {
      await pressKey(send, args[0]);
      console.log("key done");
    } else if (command === "type") {
      await insertText(send, args[0]);
      console.log("type done");
    } else {
      throw new Error(`unknown command ${command}`);
    }
  } finally {
    close();
  }
}

// Only run the CLI when this file is the process entry point; record.mjs
// imports the functions above instead.
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(error.stack ?? String(error)); process.exitCode = 1; });
}
