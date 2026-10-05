// Real settings input, fresh tutorial creation and export help in a test vault.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectByTitle, connectTarget, evaluate, listTargets, pressKey, screenshot } from "./cdp.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option("--port", "9336"));
const serial = option("--serial");
const theme = option("--theme");
if (theme !== undefined && !["obsidian", "moonstone"].includes(theme)) throw Error("unknown test theme");
const label = `${serial ?? "desktop"}${theme === "moonstone" ? "-light" : ""}`;
const adb = process.env.ADB ?? "C:/Program Files/VirtualTablet Server/adb/adb.exe";
const android = fileURLToPath(new URL("./android.mjs", import.meta.url));
const out = fileURLToPath(new URL("./.out/", import.meta.url));
const main = await connectByTitle(port, serial ? "Obsidian" : undefined);
let settings;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function checked(send, code) {
  const result = await evaluate(send, code);
  if (result?.error) throw Error(result.error);
  return result;
}
async function tap(send, point) {
  if (serial) {
    execFileSync(process.execPath, [android, "tap", "--serial", serial, "--port", String(port), "--x", String(point.x), "--y", String(point.y)]);
  } else {
    await send("Page.bringToFront");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
  }
  await wait(250);
}
async function point(send, selector) {
  return checked(send, `const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw Error('control missing'); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};`);
}
async function shot(send, name) {
  const path = `${out}design-${label}-${name}.png`;
  if (serial) execFileSync(process.execPath, [android, "shot", "--serial", serial, "--out", path]);
  else writeFileSync(path, await screenshot(send));
}
let saved;
try {
  mkdirSync(out, { recursive: true });
  saved = await checked(main.send, `
    const path=app.vault.adapter.getBasePath?.()?.replaceAll('\\\\','/')??'';
    if(app.isMobile ? app.vault.getName()!=='MiroCanvasTest' : !path.includes('/tools/obsidian_cdp/.out/'))throw Error('test vault required');
    const file=app.workspace.getActiveFile();
    window.__settingsBoardBefore=file?{path:file.path,text:await app.vault.read(file)}:null;
    return {file:file?.path,theme:app.vault.getConfig('theme')};
  `);
  if (theme !== undefined) await checked(main.send, `app.changeTheme(${JSON.stringify(theme)});app.updateTheme();return true;`);
  await checked(main.send, `app.setting.open();app.setting.openTabById('miro-canvas');return true;`);
  await wait(400);
  if (await checked(main.send, `return Boolean(document.querySelector('.miro-canvas-settings'));`)) settings = main;
  else {
    for (const target of await listTargets(port)) {
      if (target.type !== "page" || target.id === main.target.id) continue;
      const candidate = await connectTarget(target);
      if (await checked(candidate.send, `return Boolean(document.querySelector('.miro-canvas-settings'));`)) {
        settings = candidate;
        break;
      }
      candidate.close();
    }
  }
  if (!settings) throw Error("plugin settings page did not open");
  await checked(settings.send, `document.querySelector('.miro-canvas-settings').scrollTop=0;return true;`);
  await shot(settings.send, "settings");
  const initial = await checked(settings.send, `
    const root=document.querySelector('.miro-canvas-settings');
    return {sections:[...root.querySelectorAll('[data-miro-settings-section]')].map(e=>e.dataset.miroSettingsSection),width:root.clientWidth,scrollWidth:root.scrollWidth};
  `);
  assert.equal(initial.sections.length, 12);
  assert.ok(initial.scrollWidth <= initial.width + 1, "settings must not overflow horizontally");
  await tap(settings.send, await point(settings.send, ".miro-canvas-settings-jump select"));
  // Android's first Down focuses the selected row; desktop starts there already.
  for (let step = 0; step < (serial ? 6 : 5); step++) {
    if (serial) execFileSync(adb, ["-s", serial, "shell", "input", "keyevent", "20"]);
    else await pressKey(settings.send, "ArrowDown");
  }
  if (serial) execFileSync(adb, ["-s", serial, "shell", "input", "keyevent", "66"]);
  else await pressKey(settings.send, "Enter");
  await wait(300);
  const selected = await checked(settings.send, `
    const root=document.querySelector('.miro-canvas-settings');
    const heading=root.querySelector('[data-miro-settings-section=drawing] .setting-item-name');
    const header=document.querySelector('.modal-header');
    return {focus:document.activeElement===heading,focusedText:document.activeElement?.textContent,y:heading.getBoundingClientRect().top,headerBottom:header?.getBoundingClientRect().bottom??root.getBoundingClientRect().top,value:root.querySelector('select').value};
  `);
  assert.equal(selected.focus, true, `section heading receives keyboard focus: ${selected.focusedText}`);
  assert.equal(selected.value, "", "same section can be chosen again");
  assert.ok(selected.y >= selected.headerBottom - 1, "heading must clear the native header");
  await pressKey(settings.send, "Tab");
  assert.equal(await checked(settings.send, `return document.activeElement?.closest('.setting-item')?.previousElementSibling?.dataset.miroSettingsSection;`), "drawing", "Tab reaches the first setting in the section");
  await shot(settings.send, "drawing");
  await checked(settings.send, `document.querySelector('.miro-canvas-settings').scrollTop=0;return true;`);
  await tap(settings.send, await point(settings.send, ".miro-canvas-settings-action button"));
  await wait(900);
  await checked(main.send, `app.setting.close();return true;`);
  await wait(300);
  const welcome = await checked(main.send, `
    const file=app.workspace.getActiveFile();
    const raw=JSON.parse(await app.vault.read(file));
    const previous=window.__settingsBoardBefore;
    const unchanged=!previous||await app.vault.read(app.vault.getAbstractFileByPath(previous.path))===previous.text;
    return {path:file.path,sections:raw.nodes.filter(n=>n.type==='group'&&/^\\d+\\./.test(n.label??'')).length,unchanged,route:raw.nodes.find(n=>n.text?.includes('1.')&&n.text?.includes('6.')&&n.text?.includes('8.'))?.text};
  `);
  assert.notEqual(welcome.path, saved.file);
  assert.equal(welcome.sections, 12);
  assert.equal(welcome.unchanged, true);
  assert.ok(welcome.route, "tutorial keeps its short route");
  await checked(main.send, `const c=app.workspace.activeLeaf.view.canvas;c.zoomToBbox({minX:-40,minY:-40,maxX:1920,maxY:640});c.setViewport(c.tx,c.ty,c.tZoom);return true;`);
  await wait(300);
  await shot(main.send, "welcome");
  await checked(main.send, `app.plugins.plugins['miro-canvas'].activeM1Session().openExport();return true;`);
  await wait(300);
  const help = await checked(main.send, `const e=document.querySelector('.miro-canvas-export__layout-hint');const panel=document.querySelector('.miro-canvas-export');return {text:e?.textContent,width:panel?.clientWidth,scrollWidth:panel?.scrollWidth};`);
  assert.ok(help.text);
  assert.ok(help.scrollWidth <= help.width + 1, "export panel must not overflow horizontally");
  await shot(main.send, "export");
  console.log(`OK ${label}: 12 settings sections, native picker, visible heading, keyboard continuation, fresh board with 12 tutorial sections, prior board preserved, export help`);
} finally {
  if (saved) await checked(main.send, `
    app.setting.close();
    app.plugins.plugins['miro-canvas']?.activeM1Session()?.closeExport();
    const file=app.vault.getAbstractFileByPath(${JSON.stringify(saved.file ?? "")});
    if(file)await app.workspace.getLeaf(false).openFile(file,{active:true});
    app.changeTheme(${JSON.stringify(saved.theme)});
    app.updateTheme();
    delete window.__settingsBoardBefore;
    return true;
  `);
  if (settings && settings !== main) settings.close();
  main.close();
}
