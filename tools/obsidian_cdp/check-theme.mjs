// Complete board palette checks in the isolated Windows vault or MiroCanvasTest.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectByTitle, evaluate, pressKey } from './cdp.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const port = Number(option('--port', '9346'));
const serial = option('--serial');
const adb = 'C:/Program Files/VirtualTablet Server/adb/adb.exe';
const android = fileURLToPath(new URL('./android.mjs', import.meta.url));
const out = option('--out', fileURLToPath(new URL(`.out/theme-${serial ?? 'Windows'}.json`, import.meta.url)));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const client = await connectByTitle(port, serial ? 'Obsidian' : undefined);
async function dismissKeyboard() {
  if (!serial) return;
  await wait(600);
  const state = execFileSync(adb, ['-s', serial, 'shell', 'dumpsys', 'input_method'], { encoding: 'utf8', windowsHide: true });
  if (!/mInputShown=true/.test(state)) return;
  execFileSync(adb, ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'], { windowsHide: true });
  report.input.push({ method: 'real ADB key', key: 'KEYCODE_BACK', purpose: 'dismiss OS-confirmed keyboard' });
  await wait(600);
}
async function checked(code) {
  let timer;
  try {
    const result = await Promise.race([evaluate(client.send, code), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Obsidian evaluation timed out')), 15000);
    })]);
    if (result?.error) throw Error(result.error);
    return result;
  } finally { clearTimeout(timer); }
}
async function tap(selector) {
  const point = await checked(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width>0);if(!e)throw Error('missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw Error('obscured '+${JSON.stringify(selector)});return p;`);
  if (serial) {
    const focus = execFileSync(adb, ['-s', serial, 'shell', 'dumpsys', 'window'], { encoding: 'utf8', windowsHide: true });
    assert.ok(focus.split('\n').find(line => line.includes('mCurrentFocus='))?.includes('md.obsidian/'), 'Obsidian must be foreground for ADB input');
    execFileSync(process.execPath, [android, 'tap', '--serial', serial, '--port', String(port), '--x', String(point.x), '--y', String(point.y)], { windowsHide: true });
  } else {
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  }
  await wait(serial ? 600 : 250);
  report.input.push({ method: serial ? 'real ADB tap' : 'trusted background CDP mouse', selector });
}
function rgb(value) {
  const parts = value.match(/[\d.]+/g)?.map(Number);
  assert.ok(parts?.length >= 3, `unresolved color: ${value}`);
  assert.ok(parts.length < 4 || parts[3] > 0.95, `transparent palette surface: ${value}`);
  return parts.slice(0, 3);
}
function brightness(value) { return rgb(value).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0); }
function assertPalette(state, dark) {
  assert.equal(state.resolved, dark ? 'dark' : 'light');
  for (const row of state.surfaces) {
    assert.ok(row.width > 0 && row.height > 0 || row.hiddenByKeyboard, `not rendered: ${row.selector}`);
    assert.ok(dark ? brightness(row.background) < 110 : brightness(row.background) > 190, `wrong surface ${row.selector}: ${row.background}`);
    assert.ok(dark ? brightness(row.color) > 150 : brightness(row.color) < 130, `wrong text ${row.selector}: ${row.color}`);
    assert.ok(Math.abs(brightness(row.background) - brightness(row.color)) > 100, `unreadable ${row.selector}`);
  }
  assert.equal(state.custom, 'rgb(255, 232, 109)', 'explicit card color must survive');
}
async function inspect(extra = []) {
  return checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=app.workspace.activeLeaf.view.canvas,selectors=['.miro-canvas-root','.miro-canvas-root .miro-canvas-tools','.miro-canvas-root .miro-canvas-dock__bar','[data-theme-card="plain"] > .canvas-node-container',...${JSON.stringify(extra)}];return {body:document.body.className,resolved:s.root.getAttribute('data-miro-canvas-resolved-theme'),systemDark:matchMedia('(prefers-color-scheme: dark)').matches,custom:getComputedStyle(c.nodes.get('custom').nodeEl.querySelector('.canvas-node-container')).backgroundColor,surfaces:selectors.map(selector=>{const hiddenByKeyboard=(selector.endsWith('.miro-canvas-tools')||selector.endsWith('.miro-canvas-dock__bar'))&&s.root.getAttribute('data-miro-canvas-keyboard')==='open';const elements=[...document.querySelectorAll(selector)],e=elements.find(e=>e.getBoundingClientRect().width>0)??(hiddenByKeyboard?elements[0]:undefined);if(!e)throw Error('missing rendered '+selector+' '+s.toolbar.element.outerHTML.slice(0,400));const v=getComputedStyle(e),r=e.getBoundingClientRect();return {selector,background:v.backgroundColor,color:v.color,width:r.width,height:r.height,hiddenByKeyboard:hiddenByKeyboard&&r.width===0};})};`);
}
const report = { device: serial ?? 'Windows', input: [], combinations: [], negativeOracle: false, reload: false, restoration: null };
let saved;
let filename;
try {
  saved = await checked(`if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!app.vault.adapter.getBasePath().replaceAll('\\\\','/').includes('/tools/obsidian_cdp/.out/l20-windows/vault'))throw Error('test vault required');if(!app.isMobile){const w=require('@electron/remote').getCurrentWindow();if(w.isVisible()||w.isFocused())throw Error('hidden unfocused window required');}const f=app.workspace.getActiveFile(),c=app.workspace.activeLeaf.view.canvas,dir=app.vault.configDir;return {path:f.path,text:await app.vault.read(f),theme:app.vault.getConfig('theme'),viewport:{tx:c.tx,ty:c.ty,zoom:c.tZoom},config:await app.vault.adapter.read(dir+'/appearance.json'),settings:await app.vault.adapter.read(dir+'/plugins/miro-canvas/data.json'),assets:await Promise.all(['main.js','styles.css','manifest.json'].map(async name=>[name,await app.vault.adapter.read(dir+'/plugins/miro-canvas/'+name)]))};`);
  report.hashes = Object.fromEntries(saved.assets.map(([name, text]) => [name, createHash('sha256').update(text).digest('hex')]));
  if (serial) {
    report.model = execFileSync(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.model'], { encoding: 'utf8', windowsHide: true }).trim();
    report.appPackage = execFileSync(adb, ['-s', serial, 'shell', 'dumpsys', 'package', 'md.obsidian'], { encoding: 'utf8', windowsHide: true }).split('\n').filter(line => /versionName=/.test(line)).map(line => line.trim());
  }
  filename = `Board theme regression ${Date.now()}.canvas`;
  const board = { nodes: [{ id: 'plain', type: 'text', text: 'Default card', x: 0, y: 0, width: 160, height: 110 }, { id: 'custom', type: 'text', text: 'Explicit yellow', x: 210, y: 0, width: 160, height: 110 }], edges: [], miroCanvas: { schemaVersion: 1, localOverrides: { custom: { colors: { fill: '#ffe86d' } } } }, miroSource: { future: 'preserve' }, future: 'preserve' };
  await checked(`app.plugins.plugins['miro-canvas'].m1Session.resetTools();const f=await app.vault.create(${JSON.stringify(filename)},${JSON.stringify(JSON.stringify(board))});await app.workspace.getLeaf(false).openFile(f,{active:true});return true;`);
  await wait(650);
  const fit = () => checked(`const c=app.workspace.activeLeaf.view.canvas;c.zoomToBbox({minX:-50,minY:-60,maxX:420,maxY:200});c.setViewport(c.tx,c.ty,c.tZoom);c.nodes.get('plain').nodeEl.setAttribute('data-theme-card','plain');return true;`);
  await fit();
  report.originalSettings = await checked(`const p=app.plugins.plugins['miro-canvas'];const settings=JSON.parse(JSON.stringify(p.canvasSettings));return settings;`);
  await checked(`const p=app.plugins.plugins['miro-canvas'];await p.saveCanvasSettings({...p.canvasSettings,selectionToolbarEnabled:true});return true;`);
  for (const appTheme of ['moonstone', 'obsidian']) {
    await checked(`app.changeTheme(${JSON.stringify(appTheme)});app.updateTheme();return true;`);
    await wait(300);
    assert.equal(await checked(`return document.body.classList.contains('theme-dark');`), appTheme === 'obsidian', 'application theme actually changed');
    for (const boardCase of ['dark', 'light', 'system-dark', 'system-light']) {
      const boardTheme = boardCase.startsWith('system-') ? 'system' : boardCase;
      await client.send('Emulation.setEmulatedMedia', { features: boardTheme === 'system' ? [{ name: 'prefers-color-scheme', value: boardCase.slice(7) }] : [] });
      await wait(200);
      await tap('.miro-canvas-dock__bar [data-icon="settings-2"]');
      await tap(`.miro-canvas-dock__menu--board [data-value="${boardTheme}"]`);
      const dark = boardTheme === 'system' ? await checked(`return matchMedia('(prefers-color-scheme: dark)').matches;`) : boardTheme === 'dark';
      const menu = await inspect(['.miro-canvas-dock__menu--board']);
      assertPalette(menu, dark);
      await tap('.miro-canvas-dock__bar [data-icon="settings-2"]');
      await checked(`app.workspace.activeLeaf.view.canvas.deselectAll();app.plugins.plugins['miro-canvas'].m1Session.resetTools();return true;`);
      await tap('[data-theme-card="plain"]');
      assert.deepEqual(await checked(`return [...app.workspace.activeLeaf.view.canvas.selection].map(n=>n.id);`), ['plain']);
      await checked(`app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;`);
      await wait(300);
      const selected = await inspect(['.miro-canvas-root .miro-canvas-toolbar:not(.miro-canvas-tools)']);
      assertPalette(selected, dark);
      await tap('[data-theme-card="plain"]');
      await wait(400);
      const editor = await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('plain'),frame=n.nodeEl.querySelector('iframe.embed-iframe'),d=frame?.contentDocument??document,e=d.querySelector(frame?'.cm-content':'[data-theme-card="plain"] .cm-content');if(!e||!n.isEditing)throw Error('native card editor did not open');const v=d.defaultView.getComputedStyle(e),b=d.defaultView.getComputedStyle(d.body);return {iframe:Boolean(frame),color:v.color,background:b.backgroundColor,face:getComputedStyle(n.nodeEl.querySelector('.canvas-node-container')).backgroundColor};`);
      assert.ok(dark ? brightness(editor.color) > 150 : brightness(editor.color) < 130, `wrong editor text: ${JSON.stringify(editor)}`);
      const editorBackground = editor.background === 'rgba(0, 0, 0, 0)' ? editor.face : editor.background;
      assert.ok(dark ? brightness(editorBackground) < 110 : brightness(editorBackground) > 190, `wrong editor surface: ${JSON.stringify(editor)}`);
      if (serial) {
        execFileSync(adb, ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_ESCAPE'], { windowsHide: true });
        report.input.push({ method: 'real ADB key', key: 'KEYCODE_ESCAPE', purpose: 'leave card editor' });
      } else { await pressKey(client.send, 'Escape'); }
      await checked(`app.workspace.activeLeaf.view.canvas.deselectAll();return true;`);
      await dismissKeyboard();
      await tap('.miro-canvas-dock__bar [data-icon="search"]');
      const search = await inspect(['.miro-canvas-search']);
      assertPalette(search, dark);
      await tap('.miro-canvas-search button:nth-of-type(3)');
      await dismissKeyboard();
      await tap('.miro-canvas-dock__bar [data-icon="settings-2"]');
      await tap('.miro-canvas-dock__menu--board [data-icon="file-output"]');
      const exporting = await inspect(['.miro-canvas-export']);
      assertPalette(exporting, dark);
      await tap('.miro-canvas-export__close');
      assert.equal(await checked(`return document.body.classList.contains('theme-dark');`), appTheme === 'obsidian', 'board must not change application theme');
      report.combinations.push({ appTheme, boardTheme, mediaPreference: boardTheme === 'system' ? boardCase.slice(7) : 'device default', menu, selected, editor, search, exporting });
      if (dark && !report.negativeOracle) {
        const before = await checked(`const e=document.querySelector('.miro-canvas-tools');const old=e.style.backgroundColor;e.style.backgroundColor='white';return old;`);
        try { const bad = await inspect(); assert.throws(() => assertPalette(bad, true), /wrong surface/); report.negativeOracle = true; }
        finally { await checked(`document.querySelector('.miro-canvas-tools').style.backgroundColor=${JSON.stringify(before)};return true;`); }
      }
    }
  }
  await client.send('Emulation.setEmulatedMedia', { features: [] });
  await checked(`const c=app.workspace.activeLeaf.view.canvas;c.deselectAll();app.plugins.plugins['miro-canvas'].m1Session.setTheme('light');return true;`);
  await tap('[data-theme-card="plain"]');
  await tap('[data-theme-card="plain"]');
  await wait(400);
  await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;s.refresh();window.__themeEditorFrame=app.workspace.activeLeaf.view.canvas.nodes.get('plain').nodeEl.querySelector('iframe.embed-iframe');if(!window.__themeEditorFrame)throw Error('editor frame required');return true;`);
  report.editorSwitch = [];
  for (const theme of ['dark', 'light']) {
    await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;s.setTheme(${JSON.stringify(theme)});s.refresh();return true;`);
    await wait(300);
    const state = await checked(`const d=window.__themeEditorFrame.contentDocument;return {color:d.defaultView.getComputedStyle(d.querySelector('.cm-content')).color,owned:d.querySelectorAll('style[data-miro-canvas-editor-appearance]').length};`);
    assert.ok(theme === 'dark' ? brightness(state.color) > 150 : brightness(state.color) < 130, 'theme switch while editing');
    assert.equal(state.owned, theme === 'light' ? 1 : 0, 'matching scheme restores native editor');
    report.editorSwitch.push({ theme, ...state, input: 'registered session theme action / CDP setup' });
  }
  await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;const r=s.writeMetadata('theme-explicit-editor-check',m=>({...m,localOverrides:{...m.localOverrides,plain:{colors:{fill:'#ffe86d',text:'#4262ff'}}}}));if(r?.status!=='applied')throw Error('explicit color fixture rejected');s.refresh();return true;`);
  report.explicitEditor = await checked(`const d=window.__themeEditorFrame.contentDocument;return {color:d.defaultView.getComputedStyle(d.querySelector('.cm-content')).color,background:d.defaultView.getComputedStyle(d.body).backgroundColor};`);
  assert.equal(report.explicitEditor.color, 'rgb(66, 98, 255)');
  assert.equal(report.explicitEditor.background, 'rgba(0, 0, 0, 0)');
  await checked(`await app.plugins.disablePlugin('miro-canvas');return true;`);
  assert.equal(await checked(`return window.__themeEditorFrame.contentDocument.querySelectorAll('style[data-miro-canvas-editor-appearance]').length;`), 0, 'unload removes active editor stylesheet');
  await checked(`delete window.__themeEditorFrame;return true;`);
  assert.equal(await checked(`return document.querySelectorAll('.miro-canvas-root').length;`), 0, 'disable restores board ownership');
  await checked(`await app.plugins.enablePlugin('miro-canvas');return true;`);
  await wait(600);
  await fit();
  await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;const r=s.writeMetadata('theme-restore-editor-fixture',m=>({...m,localOverrides:{custom:m.localOverrides.custom}}));if(r?.status!=='applied')throw Error('fixture reset rejected');s.setTheme('system');s.refresh();return true;`);
  assertPalette(await inspect(), await checked(`return matchMedia('(prefers-color-scheme: dark)').matches;`));
  report.reload = true;
} catch (error) {
  report.failure = String(error.stack ?? error);
  console.error('THEME CHECK FAILURE', report.failure);
  throw error;
} finally {
  try {
    if (saved) {
      await checked(`delete window.__themeEditorFrame;return true;`);
      await client.send('Emulation.setEmulatedMedia', { features: [] });
      await checked(`const p=app.plugins.plugins['miro-canvas'],s=p?.m1Session;s?.closeSearch();s?.closeExport();${report.originalSettings ? `await p.saveCanvasSettings(${JSON.stringify(report.originalSettings)});` : ''}app.changeTheme(${JSON.stringify(saved.theme)});app.updateTheme();await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(saved.path)}),{active:true});return true;`);
      await wait(1700);
      await checked(`app.workspace.activeLeaf.view.canvas.setViewport(${saved.viewport.tx},${saved.viewport.ty},${saved.viewport.zoom});const f=app.vault.getAbstractFileByPath(${JSON.stringify(filename)});if(f)await app.vault.delete(f);return true;`);
      const restored = await checked(`const dir=app.vault.configDir;return {path:app.workspace.getActiveFile().path,text:await app.vault.read(app.workspace.getActiveFile()),config:await app.vault.adapter.read(dir+'/appearance.json'),settings:await app.vault.adapter.read(dir+'/plugins/miro-canvas/data.json'),hidden:app.isMobile?null:!require('@electron/remote').getCurrentWindow().isVisible(),focused:app.isMobile?null:require('@electron/remote').getCurrentWindow().isFocused()};`);
      assert.equal(restored.path, saved.path);
      assert.equal(restored.text, saved.text, 'original board bytes');
      assert.equal(restored.config, saved.config, 'application config bytes');
      assert.equal(restored.settings, saved.settings, 'plugin settings bytes');
      if (!serial) { assert.equal(restored.hidden, true); assert.equal(restored.focused, false); }
      report.restoration = { path: restored.path, boardBytes: true, configBytes: true, settingsBytes: true, hidden: restored.hidden, focused: restored.focused };
    }
  } finally { writeFileSync(out, JSON.stringify(report, null, 2)); client.close(); }
}
console.log(JSON.stringify({ device: report.device, combinations: report.combinations.length, negativeOracle: report.negativeOracle, reload: report.reload, restoration: report.restoration, hashes: report.hashes }));
