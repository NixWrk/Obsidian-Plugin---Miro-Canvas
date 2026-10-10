import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connectByTitle,evaluate} from './cdp.mjs';
const port=Number(process.argv[2]??9346);
const serial=port===9340?'R52Y808PDJB':null;
const scenario=process.argv[3]??'export';
const c=await connectByTitle(port,serial?'Obsidian':undefined);
const run=promisify(execFile);
const adb='C:/Program Files/VirtualTablet Server/adb/adb.exe';
const out=new URL('./.out/vector-viewing/',import.meta.url);
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
async function idle(){
 for(let i=0;i<400;i++){
  if(await check("return app.plugins.plugins['miro-canvas'].exportJobs.size===0;",true))return;
  await wait(100);
 }
 throw Error('job timeout');
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
 receipt.fixture=await check(`const board={nodes:[{id:'f1',type:'group',label:'First frame',x:-20,y:-20,width:300,height:220},{id:'f2',type:'group',label:'Second frame',x:300,y:-20,width:300,height:220},{id:'a',type:'text',text:${JSON.stringify('Vector / Вектор\n\n**Bold / Жирный**\n\n*Italic / Курсив*\n\n***Both / Вместе***')},x:0,y:0,width:240,height:160},{id:'b',type:'text',text:'Second / Второй',x:320,y:0,width:240,height:160}],edges:[{id:'e',fromNode:'a',fromSide:'right',toNode:'b',toSide:'left',toEnd:'arrow'}],future:{keep:true},miroSource:{evidence:'exact'},miroCanvas:{schemaVersion:1,settings:{displayTheme:'system'},localOverrides:{a:{cornerRadius:16}},export:{format:'free',orientation:'landscape',quality:'standard',pages:[{id:'p1',x:-30,y:-30,width:640,height:240,name:'First'},{id:'p2',x:300,y:-30,width:310,height:240,name:'Second'}]}}};const f=await app.vault.create('Vector viewing '+Date.now()+'.canvas',JSON.stringify(board));await app.workspace.getLeaf(false).openFile(f,{active:true});return f.path;`);
 await wait(500);
 await check(`const c=app.workspace.activeLeaf.view.canvas,s=app.plugins.plugins['miro-canvas'].m1Session;${serial?"c.setViewport(300,90,0);":"const raf=window.requestAnimationFrame,shot=c.screenshotting,pending=[];c.cancelFrame();try{c.screenshotting=true;c.x=c.tx=300;c.y=c.ty=90;c.zoom=c.tZoom=0;c.scale=1;c.viewportChanged=true;window.requestAnimationFrame=f=>{pending.push(f);return 1;};c.virtualize();for(const n of c.nodes.values()){n.render();n.mountContent?.();}c.finishViewportAnimation=true;c.requestFrame(performance.now()-1000);for(let i=0;i<16&&pending.length;i++)pending.shift()(performance.now());}finally{c.screenshotting=shot;window.requestAnimationFrame=raf;c.cancelFrame();}"}c.nodes.get('a').nodeEl.id='vector-view-node-a';c.selectOnly(c.nodes.get('a'));s.refresh();return true;`);
 if(scenario==='export'){
  await check(`const s=app.plugins.plugins['miro-canvas'].m1Session;window.vectorSaveOriginal=s.options.onSaveExport;window.vectorSaved=[];s.options.onSaveExport=async function(name,bytes,path){const result=await window.vectorSaveOriginal.call(this,name,bytes,path);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);window.vectorSaved.push({name,path:result,base64:btoa(binary),length:bytes.length});return result;};return true;`);
  for(const [kind,mode] of [['svg','raster'],['pdf','vector'],['pptx','vector'],['pdf','raster']]){
   await check("app.plugins.plugins['miro-canvas'].m1Session.openExport();return true;");
   await wait(150);
   await tap(`.miro-canvas-export__settings .miro-canvas-export__row:nth-child(2) .miro-canvas-export__segment:${mode==='vector'?'last-child':'first-child'}`);
   assert.equal(await check("return app.plugins.plugins['miro-canvas'].m1Session.exporting.rendering;"),mode);
   const before=await state();
   const oldCount=await check('return window.vectorSaved.length;');
   await tap(`.miro-canvas-export__output:nth-child(${kind==='pdf'?1:kind==='pptx'?2:3})`,false,30);
   await idle();
   const saves=await check('return window.vectorSaved;');
   assert.equal(saves.length,oldCount+1,await check("return [...document.querySelectorAll('.notice')].map(n=>n.textContent);"));
   const saved=saves.at(-1);
   const suffix=`${serial??'Windows'}-${mode}.${kind}`;
   writeFileSync(new URL(suffix,out),Buffer.from(saved.base64,'base64'));
   const after=await state();
   assert.deepEqual(after.data.nodes,before.data.nodes);
   assert.deepEqual(after.data.edges,before.data.edges);
   assert.deepEqual(after.data.miroSource,before.data.miroSource);
   assert.deepEqual(after.camera,before.camera);
   assert.deepEqual(after.selected,before.selected);
   receipt.checks.push({kind,mode,length:saved.length,path:saved.path});
  }
  await check("const s=app.plugins.plugins['miro-canvas'].m1Session;s.openExport();s.exporting.rendering='vector';s.changeExport(state=>({...state,pages:Array.from({length:20},(_,i)=>({...state.pages[0],id:'stop'+i}))}));return true;");
  const count=await check('return window.vectorSaved.length;');
  await tap('.miro-canvas-export__output:first-child',false,30);
  await tap('.miro-canvas-export__stop',true,50);
  await idle();
  assert.equal(await check('return window.vectorSaved.length;'),count);
  receipt.checks.push({name:'vector Stop: no second save, no leaked jobs/surfaces'});
 }else{
  await tap('.miro-canvas-dock__button[data-icon="settings-2"]');
  const review=await check("const e=[...document.querySelectorAll('.miro-canvas-dock__item')].find(e=>/Review mode|Режим просмотра/.test(e.textContent));if(!e)throw Error('review switch missing');e.id='viewing-review';return true;");
  await tap('#viewing-review');
  if(await check("return !document.querySelector('.miro-canvas-dock__menu--board').hidden;"))await tap('.miro-canvas-dock__button[data-icon="settings-2"]');
  await tap('#vector-view-node-a .canvas-node-container');
  receipt.review=await check("const s=app.plugins.plugins['miro-canvas'].m1Session;return {viewing:s.isViewing(),toolbarVisible:!!s.toolbar.element.getBoundingClientRect().width,creation:[...document.querySelectorAll('.miro-canvas-tools button[data-tool]')].filter(b=>!['select','lasso'].includes(b.dataset.tool)&&b.getBoundingClientRect().width>0).length};");
  assert.equal(receipt.review.viewing,true);
  assert.equal(receipt.review.toolbarVisible,false);
  assert.equal(receipt.review.creation,0);
  await check("window.vectorPointerTypes=[];window.vectorPointerLogger=e=>{if(e.pointerType==='pen')window.vectorPointerTypes.push(e.pointerType);};document.addEventListener('pointerdown',window.vectorPointerLogger,true);return true;");
  await tap('.miro-canvas-dock__button[data-icon="scan-line"]');
  await settledReview(true);
  const before=await state();
  const p=await check("const r=app.plugins.plugins['miro-canvas'].m1Session.root.getBoundingClientRect();return {x:r.left+150,y:r.top+180,dpr:devicePixelRatio};");
  if(serial){for(const [action,delta] of [['DOWN',0],['MOVE',30]])await run(adb,['-s',serial,'shell','input','touchscreen','motionevent',action,String(Math.round((p.x+delta)*p.dpr)),String(Math.round((p.y+delta)*p.dpr))],{windowsHide:true,timeout:12000});}
  else {await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1});await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+30,y:p.y+30,button:'left',buttons:1});}
  receipt.laser=await check("const s=app.plugins.plugins['miro-canvas'].m1Session;return {enabled:s.laserPointer.enabled,dot:!s.root.querySelector('.miro-canvas-laser-pointer__dot').hidden,trail:[...s.root.querySelectorAll('.miro-canvas-laser-pointer__trail')].filter(e=>!e.hidden).length};");
  assert.equal(receipt.laser.dot,true);
  assert.ok(receipt.laser.trail>0&&receipt.laser.trail<=64);
  if(serial)await run(adb,['-s',serial,'shell','input','touchscreen','motionevent','UP',String(Math.round((p.x+30)*p.dpr)),String(Math.round((p.y+30)*p.dpr))],{windowsHide:true,timeout:12000});
  else await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+30,y:p.y+30,button:'left',buttons:0});
  await wait(700);
  assert.equal(await check("return [...document.querySelectorAll('.miro-canvas-laser-pointer__trail')].filter(e=>!e.hidden).length;"),0);
  assert.deepEqual(await state(),before);
  if(serial){
   for(const [action,delta] of [['DOWN',0],['MOVE',25]])await run(adb,['-s',serial,'shell','input','stylus','motionevent',action,String(Math.round((p.x+delta)*p.dpr)),String(Math.round((p.y+delta)*p.dpr))],{windowsHide:true,timeout:12000});
   assert.equal(await check("return !document.querySelector('.miro-canvas-laser-pointer__dot').hidden;"),true);
   await run(adb,['-s',serial,'shell','input','stylus','motionevent','UP',String(Math.round((p.x+25)*p.dpr)),String(Math.round((p.y+25)*p.dpr))],{windowsHide:true,timeout:12000});
   receipt.penTypes=await check('return window.vectorPointerTypes;');
   assert.ok(receipt.penTypes.includes('pen'));
   await wait(700);
   assert.deepEqual(await state(),before);
  }

  await tap('.miro-canvas-dock__button[data-icon="settings-2"]');
  await tap('#viewing-review');
  assert.equal(await check("return app.plugins.plugins['miro-canvas'].m1Session.isViewing();"),false);
  await settledReview(false);
  const showBefore=await state();
  if(await check("return document.querySelector('.miro-canvas-dock__menu--board').hidden;"))await tap('.miro-canvas-dock__button[data-icon="settings-2"]');
  await check("const e=[...document.querySelectorAll('.miro-canvas-dock__item')].find(e=>/Present slides|Начать показ|Показать слайды|Показ слайдов/.test(e.textContent));if(!e)throw Error('present missing');e.id='viewing-present';return true;");
  await tap('#viewing-present');
  assert.equal(await check("return app.plugins.plugins['miro-canvas'].m1Session.slideShow.active;"),true);
  assert.equal(await check("return app.plugins.plugins['miro-canvas'].m1Session.isViewing();"),true);
  await tap('.miro-canvas-slideshow__next');
  assert.equal(await check("return app.plugins.plugins['miro-canvas'].m1Session.slideShow.current;"),1);
  await tap('.miro-canvas-slideshow__laser');
  assert.equal(await check("return app.plugins.plugins['miro-canvas'].m1Session.laserPointer.enabled;"),true);
  await tap('.miro-canvas-slideshow__previous');
  if(serial)await run(adb,['-s',serial,'shell','input','keyevent','111'],{windowsHide:true,timeout:12000});
  else for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await wait(200);
  assert.equal(await check("return app.plugins.plugins['miro-canvas'].m1Session.slideShow.active;"),false);
  assert.equal(await check("return app.plugins.plugins['miro-canvas'].m1Session.laserPointer.enabled;"),false);
  const after=await state();
  assert.equal(after.bytes,showBefore.bytes);
  assert.equal(after.history,showBefore.history);
  assert.equal(after.readonly,showBefore.readonly);
  receipt.checks.push({name:'native review menus, actual laser gesture/expiry, frame slideshow next/previous/laser/Escape; no data/history writes'});
 }
 receipt.passed=true;
}finally{
 try{receipt.restored=await check(`const s=app.plugins.plugins['miro-canvas'].m1Session;s.slideShow?.stop();s.laserPointer?.setEnabled(false);s.closeExport();if(window.vectorPointerLogger)document.removeEventListener('pointerdown',window.vectorPointerLogger,true);delete window.vectorPointerLogger;delete window.vectorPointerTypes;if(window.vectorSaveOriginal)s.options.onSaveExport=window.vectorSaveOriginal;const prior=window.vectorViewingPrior;if(!prior)return null;await app.plugins.plugins['miro-canvas'].saveCanvasSettings(prior.settings);app.changeTheme(prior.theme);app.updateTheme();const f=app.vault.getAbstractFileByPath(prior.path);await app.workspace.getLeaf(false).openFile(f,{active:true});await new Promise(r=>setTimeout(r,300));const c=app.workspace.activeLeaf.view.canvas;c.setViewport(prior.camera.x,prior.camera.y,prior.camera.zoom);for(const id of prior.selected){const n=c.nodes.get(id);if(n)n.select();}app.plugins.plugins['miro-canvas'].m1Session.refresh();delete window.vectorViewingPrior;delete window.vectorSaveOriginal;delete window.vectorSaved;return {unchanged:await app.vault.read(f)===prior.bytes,jobs:app.plugins.plugins['miro-canvas'].exportJobs.size,surfaces:document.querySelectorAll('[data-miro-canvas-export-renderer]').length};`,true);}finally{if(!serial)await c.send('Emulation.setFocusEmulationEnabled',{enabled:false});writeFileSync(new URL(`${serial??'Windows'}-${scenario}.json`,out),JSON.stringify(receipt,null,2));c.close();}
}
console.log(JSON.stringify(receipt));
