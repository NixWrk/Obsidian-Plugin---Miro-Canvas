import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connectByTitle,evaluate} from './cdp.mjs';
const port=Number(process.argv[2]??9346);
const serial=port===9340?'R52Y808PDJB':null;
const scenario='pan';
// Windows uses trusted mouse input. Android uses ADB swipes and labelled CDP pinch.
const c=await connectByTitle(port,serial?'Obsidian':undefined);
const run=promisify(execFile);
const adb='C:/Program Files/VirtualTablet Server/adb/adb.exe';
const out=new URL('./.out/review-pan/',import.meta.url);
mkdirSync(out,{recursive:true});
const receipt={device:serial??'Windows',scenario,passed:false,checks:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function check(code,busy=false){
 const r=await evaluate(c.send,`if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!app.vault.adapter.basePath.includes('l20-windows'))throw Error('test vault required');if(!app.isMobile){const w=require('@electron/remote').getCurrentWindow();if(w.isVisible()||w.isFocused())throw Error('hidden Windows required');}if(!${busy}&&app.plugins.plugins['miro-canvas'].exportJobs.size)throw Error('export active');${code}`);
 if(r?.error)throw Error(r.error);
 return r;
}
async function tap(selector,busy=false,delay=150){
 const p=await check(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('obscured '+${JSON.stringify(selector)}+' '+JSON.stringify({rect:r.toJSON(),menu:e.closest('[role=menu]')?.hidden,hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,150)}));return {x,y,dpr:devicePixelRatio};`,busy);
 if(serial)await run(adb,['-s',serial,'shell','input','tap',String(Math.round(p.x*p.dpr)),String(Math.round(p.y*p.dpr))],{windowsHide:true,timeout:12000});
 else for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
 await wait(delay);
}
async function settledReview(expected){
 for(let i=0;i<80;i++){
  const value=await check("return JSON.parse(await app.vault.read(app.workspace.getActiveFile())).miroCanvas?.settings?.reviewMode;");
  if(value===expected)return;
  await wait(100);
 }
 throw Error('review-mode save did not settle');
}
async function state(){return check(`const c=app.workspace.activeLeaf.view.canvas;return {path:app.workspace.getActiveFile().path,bytes:await app.vault.read(app.workspace.getActiveFile()),data:c.getData(),camera:{x:c.tx,y:c.ty,zoom:c.tZoom},selected:[...c.selection].map(n=>n.id),history:c.history.current,readonly:c.readonly};`);}
try{
 if(!serial)await c.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 receipt.runtime=await check("return {userAgent:navigator.userAgent};");
 receipt.runtime.controlledAppVersion=process.argv[4]??null;
 receipt.prior=await check(`const c=app.workspace.activeLeaf.view.canvas;window.vectorViewingPrior={path:app.workspace.getActiveFile().path,bytes:await app.vault.read(app.workspace.getActiveFile()),settings:structuredClone(app.plugins.plugins['miro-canvas'].canvasSettings),theme:app.vault.getConfig('theme'),camera:{x:c.tx,y:c.ty,zoom:c.tZoom},selected:[...c.selection].map(n=>n.id)};return {path:window.vectorViewingPrior.path};`);
 receipt.fixture=await check(`const board={nodes:[{id:'f1',type:'group',label:'First frame',x:-20,y:-20,width:300,height:220},{id:'f2',type:'group',label:'Second frame',x:300,y:-20,width:300,height:220},{id:'a',type:'text',text:'Vector / Вектор',x:0,y:0,width:240,height:160},{id:'b',type:'text',text:'Second / Второй',x:320,y:0,width:240,height:160},{id:'compact',type:'group',label:'Compact',x:0,y:240,width:260,height:180}],edges:[{id:'e',fromNode:'a',fromSide:'right',toNode:'b',toSide:'left',toEnd:'arrow'}],future:{keep:true},miroSource:{evidence:'exact'},miroCanvas:{schemaVersion:1,settings:{displayTheme:'system'},localOverrides:{a:{cornerRadius:16},b:{locked:true},compact:{groupCollapse:{width:260,height:180,children:[]}}},export:{format:'free',orientation:'landscape',quality:'standard',pages:[{id:'p1',x:-30,y:-30,width:640,height:240,name:'First'},{id:'p2',x:300,y:-30,width:310,height:240,name:'Second'}]}}};const f=await app.vault.create('Vector viewing '+Date.now()+'.canvas',JSON.stringify(board));await app.workspace.getLeaf(false).openFile(f,{active:true});return f.path;`);
 await wait(500);
 async function pose(zoom=0,selected=['a']) {
  await check(`const c=app.workspace.activeLeaf.view.canvas,s=app.plugins.plugins['miro-canvas'].m1Session;const z=${zoom};${serial?"c.setViewport(300,140,z);":"const raf=window.requestAnimationFrame,shot=c.screenshotting,pending=[];c.cancelFrame();try{c.screenshotting=true;c.x=c.tx=300;c.y=c.ty=140;c.zoom=c.tZoom=z;c.scale=2**z;c.viewportChanged=true;window.requestAnimationFrame=f=>{pending.push(f);return 1;};c.virtualize();for(const n of c.nodes.values()){n.render();n.mountContent?.();}c.finishViewportAnimation=true;c.requestFrame(performance.now()-1000);for(let i=0;i<16&&pending.length;i++)pending.shift()(performance.now());}finally{c.screenshotting=shot;window.requestAnimationFrame=raf;c.cancelFrame();}"}for(const n of c.nodes.values())n.nodeEl.id='pan-node-'+n.id;c.deselectAll();for(const id of ${JSON.stringify(selected)})c.select(c.nodes.get(id));s.refresh();return true;`);
  await wait(180);
 }
 async function swipe(selector, dx=80, dy=40, button='right') {
  const p=await check(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing gesture target');const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('gesture target obscured '+${JSON.stringify(selector)}+' '+JSON.stringify({rect:r.toJSON(),hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,200)}));return {x,y,dpr:devicePixelRatio};`);
  if(serial) await run(adb,['-s',serial,'shell','input','touchscreen','swipe',String(Math.round(p.x*p.dpr)),String(Math.round(p.y*p.dpr)),String(Math.round((p.x+dx)*p.dpr)),String(Math.round((p.y+dy)*p.dpr)),'250'],{windowsHide:true,timeout:12000});
  else {
   const buttons=button==='right'?2:button==='middle'?4:1;
   await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button,buttons});
   for(let i=1;i<=5;i++){await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*i/5,y:p.y+dy*i/5,button,buttons});await wait(25);}
   await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button,buttons:0});
  }
  await wait(150);
 }
 async function panCase(name,selector,selected,zoom=0,button='right') {
  await pose(zoom,selected);
  const before=await state();
  await swipe(selector,80,40,button);
  const after=await state();
  assert.notDeepEqual(after.camera,before.camera,name+' must pan');
  assert.equal(after.camera.zoom,before.camera.zoom);
  assert.deepEqual(after.data,before.data,name+' must preserve document');
  assert.equal(after.history,before.history,name+' must preserve history');
  assert.equal(after.bytes,before.bytes,name+' must preserve file bytes');
  assert.deepEqual(after.selected,before.selected,name+' must preserve selection');
  receipt.checks.push({name,input:serial?'ADB touchscreen swipe':'trusted CDP mouse '+button,before:before.camera,after:after.camera,documentHistoryBytesSelectionUnchanged:true});
 }
 await pose();
 await tap('.miro-canvas-dock__button[data-icon="settings-2"]');
 await check("const e=[...document.querySelectorAll('.miro-canvas-dock__item')].find(e=>/Review mode|Режим просмотра/.test(e.textContent));if(!e)throw Error('review missing');e.id='viewing-review';return true;");
 await tap('#viewing-review');
 if(await check("return !document.querySelector('.miro-canvas-dock__menu--board').hidden;"))await tap('.miro-canvas-dock__button[data-icon="settings-2"]');
 await settledReview(true);
 for(const [name,selector,selected,zoom] of [
  ['selected card','#pan-node-a .canvas-node-container',['a'],0],
  ['unselected card','#pan-node-a .canvas-node-container',[],0],
  ['locked card','#pan-node-b .canvas-node-container',['b'],0],
  ['mixed selection overlay','.miro-canvas-mixed-selection-frame',['a','b'],0],
  ['collapsed group','#pan-node-compact .canvas-node-container',['compact'],0],
  ['non-default zoom','#pan-node-a .canvas-node-container',['a'],-1],
 ]) await panCase(name,selector,selected,zoom);
 if(!serial) {
  await panCase('middle button','#pan-node-a .canvas-node-container',['a'],0,'middle');
  await pose();
  await check("app.plugins.plugins['miro-canvas'].m1Session.root.focus({preventScroll:true});return true;");
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  try{await panCase('Space + left','.canvas-mover',['a'],0,'left');}
  finally{await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});}
 }
 if(serial) {
  await pose(0,[]);
  await tap('#pan-node-a .canvas-node-container');
  receipt.tapSelected=await check("return [...app.workspace.activeLeaf.view.canvas.selection].map(n=>n.id);");
  assert.ok(receipt.tapSelected.includes('a'),'tap must still select a card');
  await pose();
  const before=await state();
  const p=await check("const r=document.querySelector('#pan-node-a').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};");
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x-25,y:p.y}]});
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x-25,y:p.y},{id:2,x:p.x+25,y:p.y}]});
  for(let i=1;i<=4;i++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:p.x-25-i*8,y:p.y},{id:2,x:p.x+25+i*8,y:p.y}]});await wait(25);}
  await c.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  const after=await state();
  assert.notEqual(after.camera.zoom,before.camera.zoom,'native two-finger pinch');
  assert.deepEqual(after.data,before.data);assert.equal(after.history,before.history);assert.equal(after.bytes,before.bytes);
  receipt.checks.push({name:'two-finger pinch/cancel on selected card',input:'CDP synthesis on physical Android WebView',before:before.camera,after:after.camera,documentHistoryBytesUnchanged:true});
  await panCase('pan after pinch cancel','#pan-node-a .canvas-node-container',['a']);
 }
 await tap('.miro-canvas-dock__button[data-icon="settings-2"]');
 await tap('#viewing-review');
 if(await check("return !document.querySelector('.miro-canvas-dock__menu--board').hidden;"))await tap('.miro-canvas-dock__button[data-icon="settings-2"]');
 await settledReview(false);
 await pose(0,[]);
 const normalBefore=await state();
 await swipe('#pan-node-a .canvas-node-container',80,40);
 const normalAfter=await state();
 assert.notDeepEqual(normalAfter.camera,normalBefore.camera,'ordinary unselected-card pan');
 assert.deepEqual(normalAfter.data,normalBefore.data);
 receipt.checks.push({name:'ordinary mode unselected-card pan restored',input:serial?'ADB touchscreen swipe':'trusted CDP mouse right'});
 receipt.passed=true;
}finally{
 try{receipt.restored=await check(`const s=app.plugins.plugins['miro-canvas'].m1Session;s.slideShow?.stop();s.laserPointer?.setEnabled(false);s.closeExport();if(window.vectorPointerLogger)document.removeEventListener('pointerdown',window.vectorPointerLogger,true);delete window.vectorPointerLogger;delete window.vectorPointerTypes;if(window.vectorSaveOriginal)s.options.onSaveExport=window.vectorSaveOriginal;if(window.panLog){for(const t of ['pointerdown','pointermove','pointerup','pointercancel'])window.removeEventListener(t,window.panLog,true);delete window.panLog;delete window.panEventLog;}const prior=window.vectorViewingPrior;if(!prior)return null;await app.plugins.plugins['miro-canvas'].saveCanvasSettings(prior.settings);app.changeTheme(prior.theme);app.updateTheme();const f=app.vault.getAbstractFileByPath(prior.path);await app.workspace.getLeaf(false).openFile(f,{active:true});await new Promise(r=>setTimeout(r,300));const c=app.workspace.activeLeaf.view.canvas;c.setViewport(prior.camera.x,prior.camera.y,prior.camera.zoom);for(const id of prior.selected){const n=c.nodes.get(id);if(n)n.select();}app.plugins.plugins['miro-canvas'].m1Session.refresh();delete window.vectorViewingPrior;delete window.vectorSaveOriginal;delete window.vectorSaved;return {unchanged:await app.vault.read(f)===prior.bytes,jobs:app.plugins.plugins['miro-canvas'].exportJobs.size,surfaces:document.querySelectorAll('[data-miro-canvas-export-renderer]').length};`,true);}finally{if(!serial)await c.send('Emulation.setFocusEmulationEnabled',{enabled:false});writeFileSync(new URL(`${serial??'Windows'}-${scenario}.json`,out),JSON.stringify(receipt,null,2));c.close();}
}
console.log(JSON.stringify(receipt));
