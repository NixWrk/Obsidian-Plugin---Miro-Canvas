import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { connectByTitle, evaluate } from './cdp.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option('--port', '9346'));
const serial = option('--serial');
const client = await connectByTitle(port, serial ? 'Obsidian' : undefined);
const run = promisify(execFile);
const adb = 'C:/Program Files/VirtualTablet Server/adb/adb.exe';
const out = new URL('./.out/host-theme-menu/', import.meta.url);
mkdirSync(out, { recursive: true });
const receipt = { device: serial ?? 'Windows', passed: false, checks: [] };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function checked(code) {
  const result = await evaluate(client.send, `
    if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!app.vault.adapter.basePath.includes('l20-windows'))throw Error('test vault required');
    if(app.plugins.plugins['miro-canvas'].exportJobs.size)throw Error('export running');
    if(!app.isMobile){const w=require('@electron/remote').getCurrentWindow();if(w.isVisible()||w.isFocused())throw Error('hidden window required');}
    ${code}`);
  if (result?.error) throw Error(result.error);
  return result;
}
async function tap(selector) {
  const p = await checked(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width&&!e.closest('[hidden]'));if(!e)throw Error('missing target');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('obscured target');return {x,y,dpr:devicePixelRatio};`);
  if (serial) {
    await run(adb, ['-s', serial, 'shell', 'input', 'tap', String(Math.round(p.x*p.dpr)), String(Math.round(p.y*p.dpr))], { windowsHide:true, timeout:12000 });
  } else {
    await client.send('Input.dispatchMouseEvent', {type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});
    await client.send('Input.dispatchMouseEvent', {type:'mouseReleased',x:p.x,y:p.y,button:'left',buttons:0,clickCount:1});
  }
  await wait(250);
}
async function menu() {
  if (await checked("return document.querySelector('.miro-canvas-dock__menu--board').hidden;")) await tap('.miro-canvas-dock__button[data-icon=settings-2]');
}
const sample = () => checked(`const root=document.querySelector('.miro-canvas-root'),panel=document.querySelector('.miro-canvas-dock__menu--board');return {body:document.body.className,resolved:root.getAttribute('data-miro-canvas-resolved-theme'),mode:root.getAttribute('data-miro-canvas-theme'),osDark:matchMedia('(prefers-color-scheme: dark)').matches,background:getComputedStyle(root).backgroundColor,panel:panel.getBoundingClientRect().toJSON(),panelColor:getComputedStyle(panel).color,rows:[...panel.querySelectorAll('.miro-canvas-dock__item')].map(e=>({label:e.querySelector('.miro-canvas-dock__item-label').textContent,row:e.getBoundingClientRect().toJSON(),text:e.querySelector('.miro-canvas-dock__item-label').getBoundingClientRect().toJSON(),switch:e.querySelector('.miro-canvas-dock__switch')?.getBoundingClientRect().toJSON(),disabled:e.disabled,scroll:e.scrollWidth,width:e.clientWidth}))};`);
function within(result) {
  for (const row of result.rows) {
    assert.ok(row.row.left >= result.panel.left-1 && row.row.right <= result.panel.right+1);
    assert.ok(row.text.left >= row.row.left-1 && row.text.right <= row.row.right+1);
    if (row.switch) assert.ok(row.switch.left >= row.row.left-1 && row.switch.right <= row.row.right+1);
    assert.ok(row.scroll <= row.width+1, row.label);
  }
}
async function hostTheme(value) {
  await checked(`app.changeTheme(${JSON.stringify(value)});app.updateTheme();return true;`);
  await wait(300);
}
try {
  if (!serial) await client.send('Emulation.setFocusEmulationEnabled', {enabled:true});
  receipt.prior = await checked(`const c=app.workspace.activeLeaf.view.canvas;window.hostThemeMenuPrior={path:app.workspace.getActiveFile().path,bytes:await app.vault.read(app.workspace.getActiveFile()),theme:app.vault.getConfig('theme'),camera:{x:c.tx,y:c.ty,zoom:c.tZoom},selected:[...c.selection].filter(Boolean).map(n=>n.id)};return window.hostThemeMenuPrior;`);
  await hostTheme('moonstone');
  receipt.fixture = await checked(`let image=app.vault.getFiles().find(f=>f.extension==='png');if(!image){image=await app.vault.createBinary('Theme menu image '+Date.now()+'.png',Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jbc8AAAAASUVORK5CYII='),c=>c.charCodeAt(0)).buffer);}const board={nodes:[{id:'a',type:'text',text:'Theme menu acceptance',x:0,y:0,width:240,height:160},{id:'f',type:'file',file:image.path,x:320,y:0,width:200,height:180}],edges:[],miroSource:{future:{keep:'exact'}},future:{keep:true},miroCanvas:{schemaVersion:1,settings:{displayTheme:'system',showAttachmentNames:false}}};const f=await app.vault.create('Host theme menu '+Date.now()+'.canvas',JSON.stringify(board));await app.workspace.getLeaf(false).openFile(f,{active:true});return {path:f.path,image:image.path};`);
  await wait(500);
  await checked("const c=app.workspace.activeLeaf.view.canvas;c.setViewport(250,100,0);c.selectOnly(c.nodes.get('a'));app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;");
  await wait(300);
  await menu();
  await tap('.miro-canvas-dock__menu--board button[data-value=system]');
  receipt.light = await sample();
  assert.equal(receipt.light.resolved,'light');
  within(receipt.light);
  const bytes = await checked('return await app.vault.read(app.workspace.getActiveFile());');
  await hostTheme('obsidian');
  receipt.dark = await sample();
  assert.equal(receipt.dark.resolved,'dark');
  assert.equal(await checked('return await app.vault.read(app.workspace.getActiveFile());'),bytes);
  await hostTheme('moonstone');
  assert.equal((await sample()).resolved,'light');
  receipt.checks.push('system follows actual owning Obsidian light/dark changes without board writes');
  await tap('.miro-canvas-dock__menu--board button[data-value=light]');
  await hostTheme('obsidian');
  assert.equal((await sample()).resolved,'light');
  await tap('.miro-canvas-dock__menu--board button[data-value=dark]');
  await hostTheme('moonstone');
  assert.equal((await sample()).resolved,'dark');
  await tap('.miro-canvas-dock__menu--board button[data-value=system]');
  assert.equal((await sample()).resolved,'light');
  receipt.checks.push('explicit board light/dark retained across host appearance changes');
  await checked("app.workspace.activeLeaf.view.canvas.deselectAll();app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;");
  await wait(200);
  receipt.disabled = await checked("return document.querySelector('.miro-canvas-dock__item:has([data-icon=text-cursor-input])').disabled;");
  assert.equal(receipt.disabled,true);
  await checked("const c=app.workspace.activeLeaf.view.canvas;c.selectOnly(c.nodes.get('f'));app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;");
  await wait(200);
  await menu();
  receipt.enabled = await sample();
  within(receipt.enabled);
  assert.equal(await checked("return document.querySelector('.miro-canvas-dock__item:has([data-icon=text-cursor-input])').disabled;"),false);
  await tap('.miro-canvas-dock__item:has([data-icon=text-cursor-input])');
  assert.equal(await checked("return app.workspace.activeLeaf.view.canvas.getData().miroCanvas.localOverrides.f.showAttachmentName;"),true);
  await tap('.miro-canvas-dock__item:has([data-icon=text-cursor-input])');
  assert.equal(await checked("return app.workspace.activeLeaf.view.canvas.getData().miroCanvas.localOverrides.f.showAttachmentName;"),false);
  await tap('.miro-canvas-dock__button[data-icon=undo-2]');
  assert.equal(await checked("return app.workspace.activeLeaf.view.canvas.getData().miroCanvas.localOverrides.f.showAttachmentName;"),true);
  await tap('.miro-canvas-dock__button[data-icon=redo-2]');
  assert.equal(await checked("return app.workspace.activeLeaf.view.canvas.getData().miroCanvas.localOverrides.f.showAttachmentName;"),false);
  assert.equal(await checked("return app.workspace.activeLeaf.view.canvas.getData().miroSource.future.keep;"),'exact');
  assert.equal(await checked("return app.workspace.activeLeaf.view.canvas.getData().future.keep;"),true);
  receipt.checks.push('all labels/switches within menu, attachment on/off/Undo/Redo and source fields preserved');
  if (serial) {
    const shot = await run(adb,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true,encoding:'buffer',timeout:12000,maxBuffer:8*1024*1024});
    writeFileSync(new URL('tablet.png',out),shot.stdout);
  }
  receipt.passed = true;
} finally {
  try {
    receipt.restored = await checked(`const p=window.hostThemeMenuPrior;if(!p)return null;app.changeTheme(p.theme);app.updateTheme();const f=app.vault.getAbstractFileByPath(p.path);await app.workspace.getLeaf(false).openFile(f,{active:true});await new Promise(r=>setTimeout(r,400));const c=app.workspace.activeLeaf.view.canvas;c.setViewport(p.camera.x,p.camera.y,p.camera.zoom);for(const id of p.selected){const n=c.nodes.get(id);if(n)n.select();}app.plugins.plugins['miro-canvas'].m1Session.refresh();delete window.hostThemeMenuPrior;return {path:p.path,unchanged:await app.vault.read(f)===p.bytes,theme:app.vault.getConfig('theme')};`);
  } catch (error) { receipt.cleanupError = String(error); }
  if (!serial) await client.send('Emulation.setFocusEmulationEnabled', {enabled:false});
  writeFileSync(new URL(`native-${serial??'Windows'}.json`,out),JSON.stringify(receipt,null,2));
  client.close();
}
console.log(JSON.stringify({device:receipt.device,passed:receipt.passed,checks:receipt.checks,restored:receipt.restored}));
