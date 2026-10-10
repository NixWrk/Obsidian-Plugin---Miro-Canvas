import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { connectByTitle, evaluate } from './cdp.mjs';

const port = Number(process.argv[2] ?? 9340);
const serial = port === 9340 ? 'R52Y808PDJB' : null;
const client = await connectByTitle(port, serial ? 'Obsidian' : undefined);
const run = promisify(execFile);
const adb = 'C:/Program Files/VirtualTablet Server/adb/adb.exe';
const out = new URL('./.out/export-panel-design/', import.meta.url);
mkdirSync(out, { recursive: true });
const receipt = { device: serial ?? 'Windows', passed: false, checks: [] };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function checked(code, duringExport = false) {
  const result = await evaluate(client.send, `if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!app.vault.adapter.basePath.includes('l20-windows'))throw Error('test vault required');if(!app.isMobile){const w=require('@electron/remote').getCurrentWindow();if(w.isVisible()||w.isFocused())throw Error('hidden required');}if(!${duringExport}&&app.plugins.plugins['miro-canvas'].exportJobs.size)throw Error('export active');${code}`);
  if (result?.error) throw Error(result.error);
  return result;
}
async function tap(selector, duringExport = false, delay = 350) {
  const p = await checked(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('obscured '+${JSON.stringify(selector)});return {x,y,dpr:devicePixelRatio};`, duringExport);
  if (serial) await run(adb, ['-s',serial,'shell','input','tap',String(Math.round(p.x*p.dpr)),String(Math.round(p.y*p.dpr))], { windowsHide:true, timeout:12000 });
  else {
    await client.send('Input.dispatchMouseEvent', {type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});
    await client.send('Input.dispatchMouseEvent', {type:'mouseReleased',x:p.x,y:p.y,button:'left',buttons:0,clickCount:1});
  }
  await wait(delay);
}
const data = () => checked(`const c=app.workspace.activeLeaf.view.canvas;return {pages:c.getData().miroCanvas.export.pages.map(p=>p.id),quality:c.getData().miroCanvas.export.quality,orientation:c.getData().miroCanvas.export.orientation,doc:c.getData(),camera:{x:c.tx,y:c.ty,zoom:c.tZoom},selected:[...c.selection].filter(Boolean).map(n=>n.id)};`);
const layout = (busy = false) => checked(`const e=document.querySelector('.miro-canvas-export');if(!e)throw Error('panel closed');return {panel:e.getBoundingClientRect().toJSON(),body:e.querySelector('.miro-canvas-export__body').getBoundingClientRect().toJSON(),footer:e.querySelector('.miro-canvas-export__footer').getBoundingClientRect().toJSON(),safeTop:parseFloat(getComputedStyle(document.body).getPropertyValue('--safe-area-inset-top'))||0,keyboard:parseFloat(getComputedStyle(document.body).getPropertyValue('--keyboard-height'))||0,viewHeight:innerHeight,viewWidth:innerWidth,background:getComputedStyle(e).backgroundColor,buttons:[...e.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),text:b.textContent,disabled:b.disabled,rect:b.getBoundingClientRect().toJSON(),radius:getComputedStyle(b).borderRadius,padding:getComputedStyle(b).padding})),scrollWidth:e.scrollWidth,width:e.clientWidth};`, busy);
function fits(sample) {
  assert.ok(sample.panel.top >= sample.safeTop);
  assert.ok(sample.panel.right <= sample.viewWidth + 1);
  assert.ok(sample.panel.bottom <= sample.viewHeight - sample.keyboard + 1);
  assert.ok(sample.scrollWidth <= sample.width + 1);
  for (const b of sample.buttons) {
    assert.ok(b.rect.height >= (serial ? 43 : 33), b.label);
    assert.ok(b.rect.left >= sample.panel.left - 1 && b.rect.right <= sample.panel.right + 1, b.label);
  }
  for (const b of sample.buttons.filter(b=>/Export |Экспорт в|Close|Закрыть|Stop|Остановить/.test(b.label))) {
    assert.ok(b.rect.top >= sample.panel.top && b.rect.bottom <= sample.panel.bottom, b.label);
  }
}
async function idle() {
  for (let i=0;i<160;i++) {
    if (await checked(`return app.plugins.plugins['miro-canvas'].exportJobs.size===0&&!app.plugins.plugins['miro-canvas'].m1Session.exporting?.busy;`, true)) return;
    await wait(100);
  }
  throw Error('export did not finish');
}
try {
  if (!serial) await client.send('Emulation.setFocusEmulationEnabled', {enabled:true});
  receipt.prior = await checked(`const c=app.workspace.activeLeaf.view.canvas;window.exportPanelPrior={path:app.workspace.getActiveFile().path,bytes:await app.vault.read(app.workspace.getActiveFile()),theme:app.vault.getConfig('theme'),settings:structuredClone(app.plugins.plugins['miro-canvas'].canvasSettings),camera:{x:c.tx,y:c.ty,zoom:c.tZoom},selected:[...c.selection].filter(Boolean).map(n=>n.id)};return window.exportPanelPrior;`);
  receipt.fixture = await checked(`const pages=[{id:'p1',x:-20,y:-20,width:300,height:220,name:'Intro'},{id:'p2',x:320,y:0,width:280,height:200,name:'Очень длинное название страницы '+ 'подробности '.repeat(18)},{id:'p3',x:0,y:240,width:280,height:200,name:'Third'}];const board={nodes:[{id:'a',type:'text',text:'Export design check',x:0,y:0,width:240,height:160},{id:'g',type:'group',label:'Frame',x:-20,y:-20,width:300,height:200}],edges:[],future:{keep:true},miroSource:{keep:'exact'},miroCanvas:{schemaVersion:1,settings:{displayTheme:'system'},localOverrides:{a:{shape:{kind:'round_rectangle',fallback:'text'},cornerRadius:16}},export:{format:'a4',orientation:'landscape',quality:'standard',pages}}};const f=await app.vault.create('Export panel design '+Date.now()+'.canvas',JSON.stringify(board));await app.workspace.getLeaf(false).openFile(f,{active:true});return f.path;`);
  await wait(500);
  await checked(`const c=app.workspace.activeLeaf.view.canvas,s=app.plugins.plugins['miro-canvas'].m1Session;${serial ? "c.setViewport(200,100,0);c.selectOnly(c.nodes.get('a'));s.refresh();" : "const raf=window.requestAnimationFrame,shot=c.screenshotting,pending=[];c.cancelFrame();try{c.screenshotting=true;c.x=c.tx=200;c.y=c.ty=100;c.zoom=c.tZoom=0;c.scale=1;c.viewportChanged=true;window.requestAnimationFrame=f=>{pending.push(f);return 1;};c.selectOnly(c.nodes.get('a'));c.virtualize();for(const n of c.nodes.values()){n.render();n.mountContent?.();}c.finishViewportAnimation=true;c.requestFrame(performance.now()-1000);for(let i=0;i<16&&pending.length;i++)pending.shift()(performance.now());}finally{c.screenshotting=shot;window.requestAnimationFrame=raf;c.cancelFrame();}s.refresh();"}s.openExport();return true;`);
  receipt.before = await data();
  receipt.themes = [];
  for (const theme of ['moonstone','obsidian']) {
    await checked(`app.changeTheme(${JSON.stringify(theme)});app.updateTheme();return true;`);
    await wait(200);
    const sample = await layout();
    fits(sample);
    receipt.themes.push({theme,...sample});
  }
  await checked(`app.changeTheme('moonstone');app.updateTheme();return true;`);
  await tap('.miro-canvas-export__page:nth-child(2) .miro-canvas-export__page-name');
  receipt.shown = await data();
  await tap('.miro-canvas-export__page:first-child .miro-canvas-export__page-action:nth-child(3)');
  assert.deepEqual((await data()).pages, ['p2','p1','p3']);
  await tap('.miro-canvas-export__page:nth-child(3) .miro-canvas-export__page-action:last-child');
  assert.deepEqual((await data()).pages, ['p2','p1']);
  await tap('.miro-canvas-export__add-button:first-child');
  assert.equal((await data()).pages.length, 3);
  await tap('.miro-canvas-export__add-button:last-child');
  assert.equal((await data()).pages.length, 4);
  await tap('.miro-canvas-export__row:first-child .miro-canvas-export__segment:last-child');
  assert.equal((await data()).orientation, 'portrait');
  await tap('.miro-canvas-export__row:last-child .miro-canvas-export__segment:last-child');
  assert.equal((await data()).quality, 'high');
  const changed = await data();
  assert.deepEqual(changed.doc.nodes, receipt.before.doc.nodes);
  assert.deepEqual(changed.doc.miroSource, receipt.before.doc.miroSource);
  assert.deepEqual(changed.doc.future, receipt.before.doc.future);
  receipt.checks.push('actual show/reorder/remove/add/frame-page/orientation/quality inputs; source nodes and unknown fields preserved');
  for (let i=0;i<4;i++) await tap('.miro-canvas-export__page:first-child .miro-canvas-export__page-action:last-child');
  receipt.empty = await layout();
  assert.equal(receipt.empty.buttons.filter(b=>/Export |Экспорт в/.test(b.label)).filter(b=>b.disabled).length, 3);
  fits(receipt.empty);
  await tap('.miro-canvas-export__add-button:first-child');
  if (serial) {
    // Layout is measured directly; user screen capture is unnecessary.
  }
  await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,old=s.options.onSaveExport;window.exportPanelSaveOriginal=old;window.exportPanelSaved=[];s.options.onSaveExport=async function(name,bytes,path){const result=await old.call(this,name,bytes,path);const xml=new TextDecoder().decode(bytes),doc=new DOMParser().parseFromString(xml,'image/svg+xml');window.exportPanelSaved.push({name,path:result,bytes:bytes.length,svg:doc.documentElement.localName==='svg',text:doc.documentElement.textContent});return result;};return true;`);
  const saveBefore = await data();
  await tap('.miro-canvas-export__output:last-child', false, 100);
  await idle();
  receipt.saved = await checked(`return window.exportPanelSaved;`);
  assert.equal(receipt.saved.length, 1);
  assert.ok(receipt.saved[0].svg && receipt.saved[0].bytes > 100);
  assert.deepEqual((await data()).camera, saveBefore.camera);
  assert.deepEqual((await data()).selected, saveBefore.selected);
  await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;s.openExport();s.changeExport(state=>({...state,pages:Array.from({length:20},(_,i)=>({...state.pages[0],id:'stop'+i}))}));return true;`);
  await tap('.miro-canvas-export__output:last-child', false, 100);
  receipt.busy = await layout(true);
  fits(receipt.busy);
  assert.ok(receipt.busy.buttons.find(b=>/Stop|Остановить/.test(b.label) && !b.disabled));
  await tap('.miro-canvas-export__stop', true, 100);
  await idle();
  assert.equal((await checked(`return window.exportPanelSaved;`)).length, 1);
  receipt.checks.push('real independent SVG save and Stop via footer; no screenshots during jobs');
  if (serial) {
    await tap('.miro-canvas-export__close');
    await checked(`const c=app.workspace.activeLeaf.view.canvas;c.setViewport(170,90,1);c.selectOnly(c.nodes.get('a'));app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;`);
    await wait(300);
    await tap('.miro-canvas-shape-radius-handle__button');
    for (let attempt=0;attempt<12;attempt++) {
      if (await checked(`return parseFloat(getComputedStyle(document.body).getPropertyValue('--keyboard-height'))>0;`)) break;
      await wait(200);
    }
    receipt.keyboardInput = await checked(`return {active:document.activeElement.className,value:document.activeElement.value,keyboard:getComputedStyle(document.body).getPropertyValue('--keyboard-height')};`);
    await checked(`app.plugins.plugins['miro-canvas'].m1Session.openExport();return true;`);
    await wait(200);
    receipt.keyboard = await layout();
    assert.ok(receipt.keyboard.keyboard > 0);
    fits(receipt.keyboard);
    await tap('.miro-canvas-export__close');
    await run(adb, ['-s',serial,'shell','input','keyevent','4'], {windowsHide:true,timeout:12000});
    receipt.checks.push('real Android radius-input keyboard; footer and Close remain in bounds');
  }
  receipt.passed = true;
} finally {
  try {
    receipt.restored = await checked(`const p=app.plugins.plugins['miro-canvas'],s=p.m1Session;if(window.exportPanelSaveOriginal&&s)s.options.onSaveExport=window.exportPanelSaveOriginal;s?.closeExport();const prior=window.exportPanelPrior;if(!prior)return null;await p.saveCanvasSettings(prior.settings);app.changeTheme(prior.theme);app.updateTheme();const f=app.vault.getAbstractFileByPath(prior.path);await app.workspace.getLeaf(false).openFile(f,{active:true});await new Promise(r=>setTimeout(r,300));const c=app.workspace.activeLeaf.view.canvas;c.setViewport(prior.camera.x,prior.camera.y,prior.camera.zoom);for(const id of prior.selected){const n=c.nodes.get(id);if(n)n.select();}p.m1Session.refresh();delete window.exportPanelPrior;delete window.exportPanelSaveOriginal;delete window.exportPanelSaved;return {path:prior.path,unchanged:await app.vault.read(f)===prior.bytes,jobs:p.exportJobs.size,surfaces:document.querySelectorAll('[data-miro-canvas-export-renderer]').length};`, true);
  } finally {
    if (!serial) await client.send('Emulation.setFocusEmulationEnabled', {enabled:false});
    writeFileSync(new URL('native-'+(serial??'Windows')+'.json',out),JSON.stringify(receipt,null,2));
    client.close();
  }
}
console.log(JSON.stringify({device:receipt.device,passed:receipt.passed,checks:receipt.checks,saved:receipt.saved?.map(s=>({name:s.name,bytes:s.bytes})),restored:receipt.restored}));
