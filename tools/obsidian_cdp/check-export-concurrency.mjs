// Trusted input in the hidden Windows test vault; no foreground or screenshots.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { connectByTitle, evaluate } from './cdp.mjs';
const client = await connectByTitle(9346);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function checked(code) {
  const value = await evaluate(client.send, code);
  if (value?.error) throw Error(value.error);
  return value;
}
async function point(id) {
  return checked(`const e=app.workspace.activeLeaf.view.canvas.nodes.get(${JSON.stringify(id)}).nodeEl,r=e.getBoundingClientRect(),p={x:r.x+Math.min(30,r.width/3),y:r.y+Math.min(30,r.height/3)};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw Error('card input obscured');return p;`);
}
async function mouse(type, p, button = 'left') {
  await client.send('Input.dispatchMouseEvent', { type, ...p, button, buttons: type === 'mouseReleased' ? 0 : button === 'middle' ? 4 : 1, clickCount: 1 });
}
let saved;
const receipt = { input: 'trusted background CDP mouse in hidden isolated Obsidian', cases: [] };
try {
  saved = await checked(`const w=require('@electron/remote').getCurrentWindow();if(w.isVisible()||w.isFocused()||!app.vault.adapter.getBasePath().includes('l20-windows'))throw Error('hidden isolated vault required');const f=app.workspace.getActiveFile(),c=app.workspace.activeLeaf.view.canvas;return {path:f.path,text:await app.vault.read(f),viewport:{x:c.tx,y:c.ty,zoom:c.tZoom}};`);
  for (const mode of ['success', 'stop', 'save-failure', 'switch-board']) {
    await checked(`
      const name='Independent concurrency '+${JSON.stringify(mode)}+' '+Date.now()+'.canvas';
      const data={nodes:[{id:'one',type:'text',text:'First card',x:0,y:0,width:180,height:120},{id:'two',type:'text',text:'Second card',x:300,y:0,width:180,height:120}],edges:[{id:'edge',fromNode:'one',fromSide:'right',toNode:'two',toSide:'left'}],miroSource:{items:[],future:'keep'},future:'keep',miroCanvas:{schemaVersion:1,export:{format:'free',orientation:'landscape',quality:'high',pages:[{id:'page',name:'Snapshot page',x:-200,y:-200,width:1600,height:1000}]}}};
      const f=await app.vault.create(name,JSON.stringify(data));await app.workspace.getLeaf(false).openFile(f,{active:true});await new Promise(r=>setTimeout(r,650));
      const p=app.plugins.plugins['miro-canvas'],s=p.m1Session,c=app.workspace.activeLeaf.view.canvas;c.setViewport(240,60,-1);c.selectOnly(c.nodes.get('one'));s.refresh();
      const nativeFactory=app.viewRegistry.viewByType.canvas;
      const state=window.__exportConcurrency={mode:${JSON.stringify(mode)},path:f.path,s,canvas:c,before:{x:c.nodes.get('one').x,camera:{x:c.x,y:c.y,zoom:c.zoom},selection:[...c.selection].map(n=>n.id)},outputs:[],notices:[],samples:[],views:[],oldFactory:nativeFactory,oldSave:s.options.onSaveExport,oldNotice:s.options.onNotice};
      app.viewRegistry.viewByType.canvas=function(...args){const v=nativeFactory.apply(this,args);state.views.push(v);return v;};
      s.options.onNotice=m=>state.notices.push(m);
      s.options.onSaveExport=async(name,bytes,sourcePath)=>{if(state.mode==='save-failure')throw Error('controlled save failure');state.outputs.push({name,size:bytes.length,sourcePath});return name;};
      s.openExport();state.exporting=s.exporting;state.job=s.runExport('pdf');state.interval=setInterval(()=>state.samples.push({x:c.x,y:c.y,zoom:c.zoom,screenshotting:Boolean(c.screenshotting),classes:c.wrapperEl.className}),25);return true;
    `);
    await wait(300);
    assert.equal(await checked(`return document.querySelectorAll('.miro-canvas-export-renderer').length;`), 1);
    const before = await checked(`return window.__exportConcurrency.before;`);
    assert.deepEqual(await checked(`const c=window.__exportConcurrency.canvas;return [c.x,c.y,c.zoom];`), [before.camera.x, before.camera.y, before.camera.zoom]);
    assert.deepEqual(await checked(`return [...window.__exportConcurrency.canvas.selection].map(n=>n.id);`), ['one']);
    const start = await point('one');
    await mouse('mousePressed', start);
    await mouse('mouseMoved', { x: start.x + 50, y: start.y + 25 });
    await wait(100);
    await mouse('mouseReleased', { x: start.x + 50, y: start.y + 25 });
    await wait(150);
    const moved = await checked(`const t=window.__exportConcurrency,c=t.canvas;t.snapshotX=t.views[0].canvas.nodes.get('one').x;return {working:c.nodes.get('one').x,snapshot:t.snapshotX};`);
    assert.ok(moved.working > before.x + 30, 'real pointer drag must move the working card');
    assert.equal(moved.snapshot, before.x, 'export geometry must keep the initial snapshot');
    const pan = await checked(`const r=window.__exportConcurrency.canvas.wrapperEl.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height*0.65};`);
    await mouse('mousePressed', pan, 'middle');
    await mouse('mouseMoved', { x: pan.x + 45, y: pan.y + 30 }, 'middle');
    await mouse('mouseReleased', { x: pan.x + 45, y: pan.y + 30 }, 'middle');
    await wait(150);
    const userState = await checked(`const c=window.__exportConcurrency.canvas;return {x:c.x,y:c.y,zoom:c.zoom,nodeX:c.nodes.get('one').x,selection:[...c.selection].map(n=>n.id)};`);
    assert.notEqual(userState.x, before.camera.x, 'real middle-button pan must work during export');
    if (mode === 'stop') {
      const stop = await checked(`const e=document.querySelector('.miro-canvas-export__stop'),r=e?.getBoundingClientRect();if(!r?.width)throw Error('Stop absent');const p={x:r.x+r.width/2,y:r.y+r.height/2};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw Error('Stop obscured');return p;`);
      await mouse('mousePressed', stop);
      await mouse('mouseReleased', stop);
    }
    if (mode === 'switch-board') {
      await checked(`const t=window.__exportConcurrency;const f=app.vault.getAbstractFileByPath(${JSON.stringify(saved.path)});await app.workspace.getLeaf(false).openFile(f,{active:true});if(t.exporting.abort.signal.aborted)throw Error('board switch cancelled independent export');return true;`);
    }
    await checked(`await window.__exportConcurrency.job;return true;`);
    const result = await checked(`const t=window.__exportConcurrency,c=t.canvas;return {mode:t.mode,outputs:t.outputs,notices:t.notices,samples:t.samples,sourcePath:t.path,snapshotX:t.snapshotX,surfaces:document.querySelectorAll('.miro-canvas-export-renderer').length,jobs:app.plugins.plugins['miro-canvas'].exportJobs.size,user: {x:c.x,y:c.y,zoom:c.zoom,nodeX:c.nodes.get('one')?.x,selection:[...c.selection].map(n=>n.id)}};`);
    assert.equal(result.surfaces, 0);
    assert.equal(result.jobs, 0);
    assert.ok(result.samples.every(sample => !sample.screenshotting && !/is-screenshotting|miro-canvas-exporting/.test(sample.classes)));
    assert.equal(result.snapshotX, before.x);
    if (mode !== 'switch-board') assert.deepEqual(result.user, userState, 'export must not undo later user work');
    if (mode === 'success' || mode === 'switch-board') { assert.equal(result.outputs.length, 1, JSON.stringify(result.notices)); assert.equal(result.outputs[0].sourcePath, result.sourcePath); }
    else assert.equal(result.outputs.length, 0);
    receipt.cases.push({ ...result, samples: result.samples.length, before, userState });
    await checked(`const t=window.__exportConcurrency;clearInterval(t.interval);app.viewRegistry.viewByType.canvas=t.oldFactory;t.s.options.onSaveExport=t.oldSave;t.s.options.onNotice=t.oldNotice;t.s.closeExport();await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(saved.path)}),{active:true});const f=app.vault.getAbstractFileByPath(t.path);if(f)await app.vault.delete(f);delete window.__exportConcurrency;return true;`);
  }
} finally {
  await checked(`const t=window.__exportConcurrency;if(t){t.exporting.abort?.abort();await t.job;clearInterval(t.interval);app.viewRegistry.viewByType.canvas=t.oldFactory;t.s.options.onSaveExport=t.oldSave;t.s.options.onNotice=t.oldNotice;t.s.closeExport();}return true;`).catch(() => undefined);
  if (saved) {
    await checked(`await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(saved.path)}),{active:true});app.workspace.activeLeaf.view.canvas.setViewport(${saved.viewport.x},${saved.viewport.y},${saved.viewport.zoom});const t=window.__exportConcurrency;if(t){const f=app.vault.getAbstractFileByPath(t.path);if(f)await app.vault.delete(f);delete window.__exportConcurrency;}return true;`);
    assert.equal(await checked(`return await app.vault.read(app.workspace.getActiveFile());`), saved.text);
    assert.equal(await checked(`return require('@electron/remote').getCurrentWindow().isVisible();`), false);
  }
  writeFileSync(new URL('.out/export-concurrency.json', import.meta.url), JSON.stringify(receipt, null, 2));
  client.close();
}
console.log(JSON.stringify({ cases: receipt.cases.map(row => ({ mode: row.mode, samples: row.samples, outputs: row.outputs.length })), realDragPan: true, snapshotGeometry: true, cleanup: true }));
