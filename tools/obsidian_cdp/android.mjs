#!/usr/bin/env node
// Drives Obsidian on an Android phone or tablet over USB (or Wi-Fi) debugging:
// Obsidian's mobile app exposes its WebView's DevTools socket, which adb
// forwards to a local port, and from there cdp.mjs talks to it exactly as it
// talks to the desktop app.
//
// It only ever writes into a vault named TEST_VAULT: a person's own vault on
// the same device is read for its name and left alone.
//
//   node tools/obsidian_cdp/android.mjs devices
//   node tools/obsidian_cdp/android.mjs forward --serial <s> --port 9340
//   node tools/obsidian_cdp/android.mjs status --port 9340
//   node tools/obsidian_cdp/android.mjs deploy --port 9340
//   node tools/obsidian_cdp/android.mjs pointer-log start|dump|stop --port 9340 [--out file.json]
//   node tools/obsidian_cdp/android.mjs shot --serial <s> --out file.png

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { connectTarget, evaluate, listTargets } from "./cdp.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEST_VAULT = "MiroCanvasTest";
const PLUGIN_ID = "miro-canvas";
const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];
const KNOWN_ADB = [
  "C:/Program Files/VirtualTablet Server/adb/adb.exe",
  join(process.env.LOCALAPPDATA ?? "", "Android/Sdk/platform-tools/adb.exe"),
];

function adbPath() {
  if (process.env.ADB) return process.env.ADB;
  const found = spawnSync(process.platform === "win32" ? "where" : "which", ["adb"], { encoding: "utf8" });
  if (found.status === 0 && found.stdout.trim()) return found.stdout.trim().split(/\r?\n/)[0];
  const known = KNOWN_ADB.find((path) => existsSync(path));
  if (known) return known;
  throw new Error("adb not found: put it on PATH or set ADB=<path to adb>");
}

function adb(args, { serial, binary = false } = {}) {
  const full = serial ? ["-s", serial, ...args] : args;
  const result = spawnSync(adbPath(), full, { encoding: binary ? "buffer" : "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`adb ${full.join(" ")} failed: ${binary ? result.stderr.toString() : result.stderr}`);
  }
  return result.stdout;
}

function option(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}

/** Every attached device with its model, so a person can tell the phone from the tablet. */
function devices() {
  const lines = adb(["devices", "-l"]).split(/\r?\n/).slice(1).filter((line) => line.trim());
  return lines.map((line) => {
    const [serial, state] = line.trim().split(/\s+/);
    const model = /model:(\S+)/.exec(line)?.[1];
    return { serial, state, model };
  });
}

/** Forwards `port` to the running Obsidian's WebView DevTools socket on that device. */
function forward(serial, port) {
  const pid = adb(["shell", "pidof", "md.obsidian"], { serial }).trim().split(/\s+/)[0];
  if (!pid) throw new Error("Obsidian is not running on the device: open it first");
  const sockets = adb(["shell", "cat", "/proc/net/unix"], { serial });
  const socket = `webview_devtools_remote_${pid}`;
  if (!sockets.includes(`@${socket}`)) throw new Error(`no DevTools socket ${socket} on the device`);
  adb(["forward", `tcp:${port}`, `localabstract:${socket}`], { serial });
  return { serial, pid, port, socket };
}

/** The Obsidian page on a forwarded port; mobile serves it from http://localhost/. */
async function connect(port) {
  const targets = await listTargets(port);
  const page = targets.find((target) => target.type === "page" && target.title === "Obsidian")
    ?? targets.find((target) => target.type === "page");
  if (!page) throw new Error(`no page target on port ${port}`);
  return connectTarget(page);
}

async function status(send) {
  return evaluate(send, `return {
    vault: app.vault.getName(),
    isMobile: app.isMobile,
    isTablet: document.body.classList.contains("is-tablet"),
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, touchPoints: navigator.maxTouchPoints },
    communityPlugins: app.plugins.isEnabled?.() ?? null,
    pluginInstalled: Boolean(app.plugins.manifests[${JSON.stringify(PLUGIN_ID)}]),
    pluginEnabled: app.plugins.enabledPlugins.has(${JSON.stringify(PLUGIN_ID)}),
    pluginVersion: app.plugins.manifests[${JSON.stringify(PLUGIN_ID)}]?.version ?? null,
    activeView: app.workspace.getActiveViewOfType?.(Object)?.getViewType?.() ?? app.workspace.activeLeaf?.view?.getViewType?.() ?? null,
  };`);
}

/** Copies this build into the test vault through Obsidian itself, then turns the plugin on (again). */
async function deploy(send) {
  const vault = await evaluate(send, "return app.vault.getName();");
  if (vault !== TEST_VAULT) {
    throw new Error(`the open vault is "${vault}", not "${TEST_VAULT}": refusing to write into it`);
  }
  const files = {};
  for (const name of PLUGIN_FILES) {
    const path = join(REPO, name);
    if (!existsSync(path)) throw new Error(`${name} is missing: run npm run build first`);
    files[name] = readFileSync(path, "utf8");
  }
  const result = await evaluate(send, `
    const files = ${JSON.stringify(files)};
    if (app.vault.getName() !== ${JSON.stringify(TEST_VAULT)}) return { error: "vault changed" };
    const folder = app.vault.configDir + "/plugins/${PLUGIN_ID}";
    if (!(await app.vault.adapter.exists(folder))) await app.vault.adapter.mkdir(folder);
    for (const [name, text] of Object.entries(files)) await app.vault.adapter.write(folder + "/" + name, text);
    await app.plugins.loadManifests();
    if (app.plugins.enabledPlugins.has("${PLUGIN_ID}")) await app.plugins.disablePlugin("${PLUGIN_ID}");
    await app.plugins.enablePluginAndSave("${PLUGIN_ID}");
    return { written: Object.keys(files), enabled: app.plugins.enabledPlugins.has("${PLUGIN_ID}"), version: app.plugins.manifests["${PLUGIN_ID}"]?.version };
  `);
  return result;
}

// Every pointer, touch and hover event the page sees, with what tells a
// stylus from a finger or a palm: its type, pressure, contact size and tilt.
const POINTER_LOG_START = `
  if (window.__miroPointerLog) return { already: true, count: window.__miroPointerLog.events.length };
  const started = performance.now();
  const events = [];
  const pointer = (event) => events.push({
    t: Math.round((event.timeStamp - started) * 10) / 10, e: event.type, id: event.pointerId, k: event.pointerType,
    x: Math.round(event.clientX * 10) / 10, y: Math.round(event.clientY * 10) / 10,
    p: Math.round(event.pressure * 1000) / 1000, w: Math.round(event.width * 10) / 10, h: Math.round(event.height * 10) / 10,
    tx: event.tiltX, ty: event.tiltY, tw: event.twist, b: event.buttons, pr: event.isPrimary,
    tg: event.target?.className?.baseVal ?? String(event.target?.className ?? "").slice(0, 60),
  });
  const touch = (event) => events.push({
    t: Math.round((event.timeStamp - started) * 10) / 10, e: event.type,
    touches: [...event.changedTouches].map((one) => ({ id: one.identifier, x: Math.round(one.clientX), y: Math.round(one.clientY),
      rx: one.radiusX, ry: one.radiusY, f: one.force, type: one.touchType ?? null })),
  });
  const types = ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerover", "pointerout", "pointerrawupdate"];
  for (const type of types) window.addEventListener(type, pointer, { capture: true, passive: true });
  for (const type of ["touchstart", "touchend", "touchcancel"]) window.addEventListener(type, touch, { capture: true, passive: true });
  window.__miroPointerLog = { events, stop() {
    for (const type of types) window.removeEventListener(type, pointer, { capture: true });
    for (const type of ["touchstart", "touchend", "touchcancel"]) window.removeEventListener(type, touch, { capture: true });
  } };
  return { started: true };
`;

async function pointerLog(send, action, out) {
  if (action === "start") return evaluate(send, POINTER_LOG_START);
  if (action === "stop") return evaluate(send, "window.__miroPointerLog?.stop(); delete window.__miroPointerLog; return { stopped: true };");
  const events = await evaluate(send, "const log = window.__miroPointerLog; if (!log) return null; const copy = log.events.slice(); log.events.length = 0; return copy;");
  if (events === null) throw new Error("no pointer log running: start one first");
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, JSON.stringify(events));
  }
  const kinds = {};
  for (const event of events) if (event.k) kinds[event.k] = (kinds[event.k] ?? 0) + 1;
  return { count: events.length, byPointerType: kinds, out: out ?? null };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const port = Number(option(args, "port", process.env.CDP_PORT ?? 9340));
  const serial = option(args, "serial", process.env.ANDROID_SERIAL);
  if (command === "devices") {
    console.log(JSON.stringify(devices(), null, 1));
    return;
  }
  if (command === "forward") {
    console.log(JSON.stringify(forward(serial, port), null, 1));
    return;
  }
  if (command === "shot") {
    const out = option(args, "out", "shot.png");
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, adb(["exec-out", "screencap", "-p"], { serial, binary: true }));
    console.log(`saved ${out}`);
    return;
  }
  const { send, close } = await connect(port);
  try {
    if (command === "status") console.log(JSON.stringify(await status(send), null, 1));
    else if (command === "deploy") console.log(JSON.stringify(await deploy(send), null, 1));
    else if (command === "pointer-log") console.log(JSON.stringify(await pointerLog(send, args[0], option(args, "out")), null, 1));
    else throw new Error("usage: android.mjs <devices|forward|status|deploy|pointer-log|shot> [--serial s] [--port n]");
  } finally {
    close();
  }
}

main().catch((error) => { console.error(error.stack ?? String(error)); process.exitCode = 1; });
