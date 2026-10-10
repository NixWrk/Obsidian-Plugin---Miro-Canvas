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
const out = new URL('./.out/selection-menu/', import.meta.url);
mkdirSync(out, { recursive: true });
const receipt = { device: serial ?? 'Windows', checks: [], passed: false };
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
  const point = await checked(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width>0&&!e.closest('[hidden]'));if(!e)throw Error('missing target '+${JSON.stringify(selector)});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('target obscured');return {x,y,dpr:devicePixelRatio};`);
  if (serial) {
    await run(adb, ['-s', serial, 'shell', 'input', 'tap', String(Math.round(point.x * point.dpr)), String(Math.round(point.y * point.dpr))], { windowsHide: true, timeout: 12000 });
  } else {
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
  }
  await wait(250);
}
async function settle() {
  await wait(400);
  await checked(`const p=app.plugins.plugins['miro-canvas'],c=app.workspace.activeLeaf.view.canvas;c.setViewport(170,90,0);c.selectOnly(c.nodes.get('a'));p.m1Session.refresh();return true;`);
  if (!serial) {
    await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=s.view.canvas,raf=window.requestAnimationFrame,shot=c.screenshotting,pending=[];c.cancelFrame();try{c.screenshotting=true;c.x=c.tx=170;c.y=c.ty=90;c.zoom=c.tZoom=0;c.scale=1;c.viewportChanged=true;window.requestAnimationFrame=f=>{pending.push(f);return 1;};c.virtualize();for(const n of c.nodes.values()){n.render();n.mountContent?.();}c.finishViewportAnimation=true;c.requestFrame(performance.now()-1000);for(let i=0;i<16&&pending.length;i++)pending.shift()(performance.now());}finally{c.screenshotting=shot;window.requestAnimationFrame=raf;c.cancelFrame();}s.refresh();return true;`);
  }
  await wait(250);
}
async function layout() {
  return checked(`const panel=document.querySelector('.miro-canvas-toolbar__panel--actions');const buttons=[...panel.querySelectorAll('button')].filter(e=>getComputedStyle(e).display!=='none'&&!e.closest('[hidden]'));return {panel:panel.getBoundingClientRect().toJSON(),viewport:{w:innerWidth,h:innerHeight},background:getComputedStyle(panel).backgroundColor,color:getComputedStyle(panel).color,buttons:buttons.map(e=>({name:e.getAttribute('aria-label'),label:e.querySelector('.miro-canvas-toolbar__menu-label')?.textContent,shortcut:e.querySelector('.miro-canvas-toolbar__menu-shortcut')?.textContent,box:e.getBoundingClientRect().toJSON(),danger:e.getAttribute('data-miro-native-danger'),disabled:e.disabled,padding:getComputedStyle(e).padding,color:getComputedStyle(e).color})),native:[...panel.querySelector('.canvas-menu').children].map(e=>({name:e.getAttribute('aria-label'),danger:e.getAttribute('data-miro-native-danger')}))};`);
}
try {
  if (!serial) await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  receipt.prior = await checked(`const c=app.workspace.activeLeaf.view.canvas;window.selectionMenuPrior={path:app.workspace.getActiveFile()?.path,bytes:await app.vault.read(app.workspace.getActiveFile()),camera:{x:c.tx,y:c.ty,zoom:c.tZoom},selected:[...c.selection].map(e=>e.id)};return window.selectionMenuPrior;`);
  if (serial) {
    const keyboard = await run(adb, ['-s', serial, 'shell', 'dumpsys', 'input_method'], { windowsHide: true, timeout: 12000 });
    if (/mInputShown=true/u.test(keyboard.stdout)) {
      await run(adb, ['-s', serial, 'shell', 'input', 'keyevent', '4'], { windowsHide: true, timeout: 12000 });
      await wait(500);
    }
  }
  receipt.fixture = await checked(`const board={nodes:[{id:'a',type:'text',text:'Menu acceptance',x:0,y:0,width:240,height:100},{id:'b',type:'text',text:'Overlap',x:160,y:60,width:240,height:100}],edges:[{id:'e',fromNode:'a',fromSide:'right',toNode:'b',toSide:'left'}],future:{keep:true},miroCanvas:{schemaVersion:1,connectors:{own:{id:'own',from:{type:'free',x:50,y:230},to:{type:'free',x:300,y:230},route:'straight',color:'#123456',width:2,startCap:'none',endCap:'arrow'}},localOverrides:{a:{shape:{kind:'round_rectangle',fallback:'text'},cornerRadius:16}}}};const f=await app.vault.create('Selection menu acceptance '+Date.now()+'.canvas',JSON.stringify(board));await app.workspace.getLeaf(false).openFile(f,{active:true});return {path:f.path};`);
  await settle();
  await tap('.miro-canvas-toolbar__button--more');
  receipt.layout = await layout();
  const rows = receipt.layout.buttons;
  assert.ok(rows.length >= 7);
  for (const row of rows) {
    assert.equal(row.label, row.name.split('\n')[0]);
    assert.ok(row.box.height >= (serial ? 44 : 34));
    assert.ok(Math.abs(row.box.x - rows[0].box.x) < 1);
    assert.ok(Math.abs(row.box.width - rows[0].box.width) < 1);
  }
  assert.equal(receipt.layout.native.at(-1).danger, 'true');
  assert.ok(receipt.layout.panel.right <= receipt.layout.viewport.w - 7);
  assert.ok(receipt.layout.panel.bottom <= receipt.layout.viewport.h - 7);
  receipt.checks.push('labelled aligned rows, delete last, bounds and touch target sizes');
  if (serial) {
    const screenshot = await run(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, encoding: 'buffer', timeout: 12000, maxBuffer: 8 * 1024 * 1024 });
    writeFileSync(new URL('tablet.png', out), screenshot.stdout);
  }
  const history = await checked('const c=app.workspace.activeLeaf.view.canvas;if(c.history.data.length===0)c.pushHistory(c.getData());return c.history.current;');
  await tap('.miro-canvas-toolbar__panel--actions button[data-value="forward"]');
  receipt.layer = await checked(`const c=app.workspace.activeLeaf.view.canvas;return {order:c.getData().nodes.map(n=>n.id),history:c.history.current,closed:document.querySelector('.miro-canvas-toolbar__panel--actions').hidden};`);
  assert.deepEqual(receipt.layer.order, ['b', 'a']);
  assert.equal(receipt.layer.history, history + 1);
  assert.equal(receipt.layer.closed, true);
  await tap('.miro-canvas-dock button[data-icon="undo-2"]');
  assert.deepEqual(await checked('return app.workspace.activeLeaf.view.canvas.getData().nodes.map(n=>n.id);'), ['a', 'b']);
  receipt.checks.push('input layer command, single history, close and Undo');
  await settle();
  await tap('.miro-canvas-toolbar__button--more');
  await tap('.miro-canvas-toolbar__native .canvas-menu button:has(> .zoom-to-selection)');
  const camera = await checked(`const c=app.workspace.activeLeaf.view.canvas;return {x:c.tx,y:c.ty,z:c.tZoom};`);
  assert.notDeepEqual(camera, {x:170,y:90,z:0});
  receipt.checks.push('native zoom handler retains original button behavior');
  await settle();
  const open = await checked('return !document.querySelector(".miro-canvas-toolbar__panel--actions").hidden;');
  if (!open) await tap('.miro-canvas-toolbar__button--more');
  await tap('.miro-canvas-toolbar__native button[data-miro-native-danger="true"]');
  assert.ok(!(await checked('return app.workspace.activeLeaf.view.canvas.getData().nodes.map(n=>n.id);')).includes('a'));
  await tap('.miro-canvas-dock button[data-icon="undo-2"]');
  assert.ok((await checked('return app.workspace.activeLeaf.view.canvas.getData().nodes.map(n=>n.id);')).includes('a'));
  receipt.checks.push('native delete and Undo');
  await settle();
  if (await checked('return document.querySelector(".miro-canvas-toolbar__panel--actions").hidden;')) await tap('.miro-canvas-toolbar__button--more');
  receipt.themes = {};
  for (const theme of ['light', 'dark']) {
    await checked(`app.plugins.plugins['miro-canvas'].m1Session.setTheme(${JSON.stringify(theme)});return true;`);
    await wait(200);
    receipt.themes[theme] = await layout();
  }
  assert.notEqual(receipt.themes.light.background, receipt.themes.dark.background);
  assert.notEqual(receipt.themes.light.color, receipt.themes.dark.color);
  receipt.checks.push('native light/dark board theme colors');
  await settle();
  if (await checked('return document.querySelector(".miro-canvas-toolbar__panel--actions").hidden;')) await tap('.miro-canvas-toolbar__button--more');
  await tap('.miro-canvas-toolbar__native .canvas-menu button:has(> .lucide-edit)');
  receipt.edit = await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('a');return {classes:n.nodeEl.className,focused:n.nodeEl.contains(document.activeElement),editing:n.isEditing};`);
  assert.ok(receipt.edit.editing === true || receipt.edit.classes.includes('is-editing') || receipt.edit.focused);
  receipt.checks.push('native edit handler enters editor');
  await checked(`app.workspace.activeLeaf.view.canvas.nodes.get('a').blur();return true;`);
  if (serial) {
    const keyboard = await run(adb, ['-s', serial, 'shell', 'dumpsys', 'input_method'], { windowsHide: true, timeout: 12000 });
    if (/mInputShown=true/u.test(keyboard.stdout)) await run(adb, ['-s', serial, 'shell', 'input', 'keyevent', '4'], { windowsHide: true, timeout: 12000 });
  }
  await wait(500);
  await checked("const c=app.workspace.activeLeaf.view.canvas;c.selectOnly(c.edges.get('e'));app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;");
  await tap('.miro-canvas-toolbar__button--more');
  receipt.edge = await layout();
  assert.ok(!receipt.edge.buttons.some(row => ['front', 'forward', 'backward', 'back'].some(value => row.name === value)));
  assert.equal(await checked("return document.querySelector('.miro-canvas-toolbar__menu-section').hidden;"), true);
  await checked("app.plugins.plugins['miro-canvas'].m1Session.selectConnectors(['own']);app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;");
  await tap('.miro-canvas-toolbar__button--more');
  receipt.independent = await checked("const root=document.querySelector('[data-miro-canvas-toolbar=true]'),panel=root.querySelector('.miro-canvas-toolbar__panel--actions');return {independent:root.getAttribute('data-miro-independent-only'),native:getComputedStyle(panel.querySelector('.canvas-menu')).display,fallback:panel.querySelector('.miro-canvas-toolbar__button--delete').hidden};");
  assert.equal(receipt.independent.independent, 'true');
  assert.equal(receipt.independent.native, 'none');
  assert.equal(receipt.independent.fallback, false);
  receipt.checks.push('edge layers hidden, independent fallback delete with native menu hidden');
  receipt.passed = true;
} finally {
  try {
    receipt.restored = await checked(`const prior=window.selectionMenuPrior;if(!prior)return null;const f=app.vault.getAbstractFileByPath(prior.path);if(f){await app.workspace.getLeaf(false).openFile(f,{active:true});await new Promise(r=>setTimeout(r,400));const c=app.workspace.activeLeaf.view.canvas;c.setViewport(prior.camera.x,prior.camera.y,prior.camera.zoom);for(const id of prior.selected){const n=c.nodes.get(id);if(n)n.select();}app.plugins.plugins['miro-canvas'].m1Session.refresh();}const unchanged=f&&await app.vault.read(f)===prior.bytes;delete window.selectionMenuPrior;return {path:prior.path,unchanged};`);
  } catch (error) { receipt.cleanupError = String(error); }
  if (!serial) await client.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  writeFileSync(new URL(`native-${serial ?? 'Windows'}.json`, out), JSON.stringify(receipt, null, 2));
  client.close();
}
console.log(JSON.stringify({device:receipt.device,passed:receipt.passed,checks:receipt.checks,restored:receipt.restored}));
