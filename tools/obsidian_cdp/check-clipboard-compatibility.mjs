// Installed clipboard/menu checks. Windows stays hidden; Android clicks use ADB.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {connectByTitle,evaluate} from './cdp.mjs';
const args=process.argv.slice(2), option=key=>args[args.indexOf(key)+1];
assert.ok(args.includes('--port'));
const port=Number(option('--port')),serial=args.includes('--serial')?option('--serial'):undefined;
const failuresOnly=args.includes('--failures-only');
assert.ok(!failuresOnly||serial,'legacy failure probes require an explicit Android serial');
const {send,close}=await connectByTitle(port,serial?'Obsidian':undefined);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={device:serial??'Windows',input:serial?'ADB menu taps, CDP native API fixture/selection; trusted clipboard events counted separately':'trusted background CDP menu clicks, native API fixture/selection; no OS input',passed:false};
async function checked(code){const r=await evaluate(send,`if(Boolean(${JSON.stringify(serial??null)})!==app.isMobile)throw Error('explicit platform/serial mismatch');const base=app.vault.adapter.getBasePath?.().split(String.fromCharCode(92)).join('/');if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!base?.includes('/tools/obsidian_cdp/.out/')||require('@electron/remote').getCurrentWindow().isVisible())throw Error('isolated hidden Windows or Android test vault required');${code}`);if(r?.error)throw Error(r.error);return r;}
async function tapAction(action){
 await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;s.options.onConnectorMenu(new MouseEvent('contextmenu',{clientX:220,clientY:260}),action=>s.clipboardCommand(action));return true;`);
 await wait(100);
 const point=await checked(`const icon=document.querySelector(${JSON.stringify('.menu .lucide-'+({copy:'copy',cut:'scissors',paste:'clipboard-check'}[action]))});const row=icon?.closest('.menu-item');if(!row)throw Error('actual connector menu action absent');let last,stable=0,r;for(let i=0;i<20;i++){r=row.getBoundingClientRect();const key=JSON.stringify([r.x,r.y,r.width,r.height]);stable=key===last?stable+1:0;last=key;if(stable>=3)break;await new Promise(resolve=>setTimeout(resolve,80));}if(stable<3)throw Error('native menu animation did not settle');const p={x:r.x+r.width/2,y:r.y+r.height/2};if(!row.contains(document.elementFromPoint(p.x,p.y)))throw Error('menu obscured');return p;`);
 if(serial)execFileSync(process.execPath,[fileURLToPath(new URL('./android.mjs',import.meta.url)),'tap','--serial',serial,'--port',String(port),'--x',String(point.x),'--y',String(point.y)]);
 else {await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});}
 await wait(300);
}
const board={nodes:[{id:'a',type:'text',text:'Clipboard A',x:0,y:0,width:200,height:120,future:{keep:true}},{id:'b',type:'text',text:'Clipboard B',x:300,y:0,width:200,height:120}],edges:[{id:'edge',fromNode:'a',fromSide:'right',toNode:'b',toSide:'left',future:{keep:true}}],miroSource:{future:{keep:true}},miroCanvas:{schemaVersion:1,localOverrides:{a:{typography:{fontSize:22},future:{keep:true}}},future:{keep:true}},future:{keep:true}};
let saved;
try{
 saved=await checked(`const f=app.workspace.getActiveFile();return {path:f.path,text:await app.vault.read(f)};`);
 if(!failuresOnly&&serial) {
  // Android cannot restore arbitrary native formats via the web clipboard API.
  report.clipboardBackup=await checked(`if(typeof navigator.clipboard.read!=='function')throw Error('cannot verify restorable Android clipboard formats');const items=await navigator.clipboard.read();if(items.some(item=>item.types.some(type=>type!=='text/plain')))throw Error('Android clipboard contains formats this test cannot restore');const backup={text:await navigator.clipboard.readText()};window.__l20ClipboardBackup=backup;return {textHeldInMemory:true,formatsVerified:true};`);
 } else if(!failuresOnly) report.clipboardBackup=await checked(`const c=window.electron.clipboard,formats=c.availableFormats();window.__l20ClipboardBackup={formats,text:c.readText(),html:c.readHTML(),rtf:c.readRTF(),image:c.readImage(),extra:formats.filter(f=>!['text/plain','text/html','text/rtf','image/png'].includes(f)).map(f=>[f,c.readBuffer(f)])};return {formats:formats.length,payloadLogged:false};`);
 const path=`L20 clipboard ${serial??'Windows'} ${Date.now()}.canvas`;
 await checked(`const f=await app.vault.create(${JSON.stringify(path)},${JSON.stringify(JSON.stringify(board))});await app.workspace.getLeaf(false).openFile(f,{active:true});window.__l20ClipboardEvents=[];window.__l20ClipboardCapture=e=>window.__l20ClipboardEvents.push({type:e.type,trusted:e.isTrusted,types:[...e.clipboardData.types]});for(const type of ['copy','cut','paste'])window.addEventListener(type,window.__l20ClipboardCapture,true);return true;`);
 await wait(500);
 const select=()=>checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=app.workspace.activeLeaf.view.canvas;c.deselectAll();c.selection.add(c.nodes.get('a'));c.selection.add(c.nodes.get('b'));c.selection.add(c.edges.get('edge'));s.refresh();return {nodes:c.nodes.size,edges:c.edges.size,h:c.history.current};`);
 await select();
 if(failuresOnly){
  report.failureCases=[];
  for(const mode of ['missing','false','throw']){
   const before=await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=app.workspace.activeLeaf.view.canvas;window.__l20ClipboardFailureBackup={descriptor:Object.getOwnPropertyDescriptor(document,'execCommand'),notice:s.options.onNotice};window.__l20ClipboardFailureCalls=[];window.__l20ClipboardFailureNotices=[];s.options.onNotice=m=>window.__l20ClipboardFailureNotices.push(m);Object.defineProperty(document,'execCommand',{configurable:true,value:${JSON.stringify(mode)}==='missing'?undefined:function(action){window.__l20ClipboardFailureCalls.push({action,receiver:this===document});if(${JSON.stringify(mode)}==='throw')throw Error('forced legacy failure');return false;}});return {data:JSON.stringify(c.getData()),h:c.history.current};`);
   try{
    await tapAction('cut');
    const after=await checked(`const c=app.workspace.activeLeaf.view.canvas;return {data:JSON.stringify(c.getData()),h:c.history.current,calls:window.__l20ClipboardFailureCalls,notices:window.__l20ClipboardFailureNotices.length,events:window.__l20ClipboardEvents.length};`);
    assert.equal(after.data,before.data);assert.equal(after.h,before.h);assert.equal(after.events,0);assert.equal(after.notices,1);assert.deepEqual(after.calls,mode==='missing'?[]:[{action:'cut',receiver:true}]);
    report.failureCases.push({mode,explicitlyInjectedHost:true,unchangedGraph:true,unchangedHistory:true,noClipboardEvent:true,notice:true,calls:after.calls});
   }finally{await checked(`const b=window.__l20ClipboardFailureBackup,s=app.plugins.plugins['miro-canvas'].m1Session;if(b.descriptor)Object.defineProperty(document,'execCommand',b.descriptor);else delete document.execCommand;s.options.onNotice=b.notice;delete window.__l20ClipboardFailureBackup;delete window.__l20ClipboardFailureCalls;delete window.__l20ClipboardFailureNotices;return true;`);}
  }
  report.clipboardAccess='none; missing/false/throw legacy capability branches only';
 }else{
 await tapAction('copy');
 const copied=await checked('return window.__l20ClipboardEvents;');
 assert.ok(copied.some(e=>e.type==='copy'&&e.trusted),'actual trusted copy event');
 const before=await checked('const c=app.workspace.activeLeaf.view.canvas;return {h:c.history.current,nodes:c.nodes.size,edges:c.edges.size};');
 await tapAction('paste');
 report.paste=await checked(`const c=app.workspace.activeLeaf.view.canvas,d=c.getData();return {nodes:c.nodes.size,edges:c.edges.size,h:c.history.current,source:d.miroSource,future:d.future,metadataFuture:d.miroCanvas.future,unknownNodes:d.nodes.filter(n=>n.future?.keep).length,unknownEdges:d.edges.filter(e=>e.future?.keep).length,overrides:Object.values(d.miroCanvas.localOverrides).filter(v=>v.future?.keep&&v.typography?.fontSize===22).length};`);
 assert.equal(report.paste.nodes,4);assert.equal(report.paste.edges,2);assert.equal(report.paste.h,before.h+1);assert.deepEqual(report.paste.source,board.miroSource);assert.deepEqual(report.paste.future,board.future);assert.equal(report.paste.unknownNodes,2);assert.equal(report.paste.unknownEdges,2);assert.equal(report.paste.overrides,2);
 await checked('const c=app.workspace.activeLeaf.view.canvas;c.undo();return true;');await wait(150);
 assert.equal(await checked('return app.workspace.activeLeaf.view.canvas.nodes.size;'),2);
 await checked('app.workspace.activeLeaf.view.canvas.redo();return true;');await wait(150);
 assert.equal(await checked('return app.workspace.activeLeaf.view.canvas.nodes.size;'),4);
 await select();
 const cutBefore=await checked('return app.workspace.activeLeaf.view.canvas.history.current;');
 await tapAction('cut');
 report.cut=await checked('const c=app.workspace.activeLeaf.view.canvas;return {nodes:c.nodes.size,edges:c.edges.size,h:c.history.current};');
 assert.equal(report.cut.nodes,2);assert.equal(report.cut.edges,1);assert.equal(report.cut.h,cutBefore+1);
 await checked('app.workspace.activeLeaf.view.canvas.undo();return true;');await wait(150);assert.equal(await checked('return app.workspace.activeLeaf.view.canvas.nodes.size;'),4);
 await checked('app.workspace.activeLeaf.view.canvas.redo();return true;');await wait(150);assert.equal(await checked('return app.workspace.activeLeaf.view.canvas.nodes.size;'),2);
 report.events=await checked('return window.__l20ClipboardEvents;');
 assert.ok(report.events.some(e=>e.type==='paste'&&e.trusted));assert.ok(report.events.some(e=>e.type==='cut'&&e.trusted));
 }
 report.passed=true;
}finally{
 try {
  report.clipboardRestored=failuresOnly?'not-accessed':await checked(`const b=window.__l20ClipboardBackup;if(!b)return false;if(app.isMobile){await navigator.clipboard.writeText(b.text);if(await navigator.clipboard.readText()!==b.text)throw Error('clipboard restore');}else{const c=window.electron.clipboard;if(!b.formats.length)c.clear();else{c.write({...(b.formats.includes('text/plain')?{text:b.text}:{}),...(b.formats.includes('text/html')?{html:b.html}:{}),...(b.formats.includes('text/rtf')?{rtf:b.rtf}:{}),...(b.image.isEmpty()?{}:{image:b.image})});for(const[f,v]of b.extra)c.writeBuffer(f,v);}if(c.readText()!==b.text||c.readHTML()!==b.html||c.readRTF()!==b.rtf||!c.readImage().toPNG().equals(b.image.toPNG())||b.extra.some(([f,v])=>!c.readBuffer(f).equals(v)))throw Error('clipboard restore; memory backup retained');}delete window.__l20ClipboardBackup;return true;`);
  await checked(`for(const type of ['copy','cut','paste'])window.removeEventListener(type,window.__l20ClipboardCapture,true);delete window.__l20ClipboardCapture;delete window.__l20ClipboardEvents;return true;`);
  if(saved){await checked(`await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(saved.path)}),{active:true});return true;`);await wait(500);assert.equal(await checked(`return await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(saved.path)}))===${JSON.stringify(saved.text)};`),true,'original file bytes');}
 }finally{mkdirSync(new URL('./.out/l20-native/',import.meta.url),{recursive:true});writeFileSync(new URL(`./.out/l20-native/clipboard-${serial??'Windows'}${failuresOnly?'-failures':''}.json`,import.meta.url),JSON.stringify(report,null,2));close();}
}
console.log(`OK ${serial??'Windows'} trusted native clipboard/menu ${failuresOnly?'guarded failures':'roundtrip'}`);
