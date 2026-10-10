// Real installed Obsidian; trusted CDP renderer input, no screen/OS activation.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { connectByTitle, evaluate, pressKey } from "./cdp.mjs";
const port = Number(process.argv[2] ?? 9348);
const client = await connectByTitle(port);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = { port, input: "trusted CDP renderer mouse/key input", preparation: "Vault fixture staging; private Canvas viewport/selection probes", screenshots: false, osInput: false, checks: [], passed: false };
const out = new URL("./.out/import-expansion-native/", import.meta.url);
mkdirSync(out, { recursive: true });
async function checked(code) {
 const result = await evaluate(client.send, `if(!app.vault.adapter.basePath.includes('import-expansion-${port}'))throw Error('owned vault required');const w=require('@electron/remote').getCurrentWindow();if(w.isVisible()||w.isFocused())throw Error('hidden window required');${code}`);
 if(result?.error) throw Error(result.error);
 return result;
}
async function until(code) {
 for(let i=0;i<80;i++) { const value=await checked(code); if(value) return value; await wait(100); }
 throw Error("condition did not settle: "+code);
}
async function mouse(type,x,y,button="left",buttons=0) {
 await client.send("Input.dispatchMouseEvent",{type,x,y,button,buttons,clickCount:type==="mouseMoved"?0:1});
}
async function click(selector) {
 const p=await checked(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
 await mouse("mousePressed",p.x,p.y,"left",1); await mouse("mouseReleased",p.x,p.y); await wait(100);
}
async function create(path,text) {
 return checked(`const path=${JSON.stringify(path)};const parent=path.slice(0,path.lastIndexOf('/'));if(parent&&!app.vault.getAbstractFileByPath(parent))await app.vault.createFolder(parent);const f=app.vault.getAbstractFileByPath(path);if(f){if(await app.vault.read(f)!==${JSON.stringify(text)})throw Error('fixture collision');return f.path;}return (await app.vault.create(path,${JSON.stringify(text)})).path;`);
}
async function palette(path) {
 await checked(`await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(path)}),{active:true});return true;`);
 await wait(200);
 await pressKey(client.send,"p",{modifiers:2});
 await until("return !!document.querySelector('.prompt-input');");
 await client.send("Input.insertText",{text:"Import into a board"}); await wait(180); await pressKey(client.send,"Enter");
 await until("return !!document.querySelector('.miro-canvas-import-preview-modal');");
}
async function importFile(path,{cancel=false,report=true}={}) {
 const before=await checked(`return {source:await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(path)})),files:app.vault.getFiles().map(f=>f.path).sort()};`);
 await palette(path);
 const preview=await checked("return document.querySelector('.miro-canvas-import-preview').innerText;");
 if(!report) await click('.miro-canvas-import-preview__report-card input');
 if(cancel) { await pressKey(client.send,'Escape'); await wait(150); assert.deepEqual(await checked('return app.vault.getFiles().map(f=>f.path).sort();'),before.files); receipt.checks.push({name:'cancel',path,preview,filesUnchanged:true}); return; }
 await click('.miro-canvas-import-preview .mod-cta');
 const board=await until("const f=app.workspace.getActiveFile();return f?.extension==='canvas'?f.path:false;");
 await until("return !!app.plugins.plugins['miro-canvas'].m1Session;");
 await wait(900);
 const state=await checked(`return {document:JSON.parse(await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(board)}))),source:await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(path)}))};`);
 assert.equal(state.source,before.source);receipt.checks.push({name:'import',source:path,board,preview,sourceUnchanged:true,report});
 return {board,document:state.document};
}
async function pose(ids,zoom=-1) {
 await checked(`const c=app.workspace.activeLeaf.view.canvas,s=app.plugins.plugins['miro-canvas'].m1Session;const raf=window.requestAnimationFrame,pending=[];c.cancelFrame();try{c.x=c.tx=240;c.y=c.ty=110;c.zoom=c.tZoom=${zoom};c.scale=2**${zoom};c.viewportChanged=true;window.requestAnimationFrame=f=>{pending.push(f);return 1;};c.virtualize();for(const n of c.nodes.values()){n.render();n.mountContent?.();n.nodeEl.id='import-node-'+n.id;}c.finishViewportAnimation=true;c.requestFrame(performance.now()-1000);for(let i=0;i<20&&pending.length;i++)pending.shift()(performance.now());}finally{window.requestAnimationFrame=raf;c.cancelFrame();}c.deselectAll();for(const id of ${JSON.stringify(ids)})c.select(c.nodes.get(id));s.refresh();return true;`);
 await wait(180);
}
async function state() {
 return checked(`const c=app.workspace.activeLeaf.view.canvas;return {document:c.getData(),bytes:await app.vault.read(app.workspace.getActiveFile()),native:[...c.edges.values()].map(e=>({id:e.id,d:e.lineGroupEl?.querySelector('path.canvas-display-path')?.getAttribute('d')})),independent:[...document.querySelectorAll('.miro-board-connector-hit')].map(e=>({id:e.getAttribute('data-connector-id'),d:e.getAttribute('d')}))};`);
}
async function gesture(name,selector,dx,dy,ids) {
 await pose(ids);
 const before=await state();
 const p=await checked(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing gesture '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();for(const [u,v] of [[.5,.5],[.98,.98],[.02,.98],[.98,.5],[.02,.5],[.5,.98]]){const x=r.x+r.width*u,y=r.y+r.height*v;if(e.contains(document.elementFromPoint(x,y)))return {x,y};}throw Error('gesture obscured '+${JSON.stringify(selector)});`);
 await mouse('mousePressed',p.x,p.y,'left',1);
 for(let i=1;i<=6;i++) { await mouse('mouseMoved',p.x+dx*i/6,p.y+dy*i/6,'left',1);await wait(35); }
 const held=await state();
 assert.notDeepEqual(held.native,before.native,name+' native preview follows');
 assert.notDeepEqual(held.independent,before.independent,name+' independent preview follows');
 assert.deepEqual(JSON.parse(held.bytes),JSON.parse(before.bytes),name+' preview document is not saved');
 await mouse('mouseReleased',p.x+dx,p.y+dy);await wait(550);
 const committed=await state();
 assert.notDeepEqual(committed.document,before.document,name+' commits');
 await checked("app.plugins.plugins['miro-canvas'].m1Session.root.focus({preventScroll:true});return true;");
 await pressKey(client.send,'z',{modifiers:2});await wait(550);
 const undone=await state();
 const positions=d=>d.nodes.map(n=>[n.id,n.x,n.y,n.width,n.height]);
 assert.deepEqual(positions(undone.document),positions(before.document),name+' undo positions');
 assert.deepEqual(undone.document.miroCanvas,before.document.miroCanvas,name+' undo metadata');
 receipt.checks.push({name,zoom:-1,nativeBefore:before.native,nativeHeld:held.native,independentBefore:before.independent,independentHeld:held.independent,previewNotSaved:true,committed:true,undo:true});
}
try {
 await client.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 receipt.runtime=await checked("return {userAgent:navigator.userAgent,desktop:require('@electron/remote').getCurrentWindow().isVisible(),sdk:window.__importQaSdk};");
 await create('Native note.md','# Topic\nИмпорт и ссылки.\n\nБлок ^block\n');
 receipt.runtime.asar=readdirSync(new URL(`./.out/import-expansion-${port}/profile/`,import.meta.url)).find(name=>/^obsidian-.*\.asar$/u.test(name));
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 const shape=(id,type,x,y,width,height,more={})=>({id,type,x,y,width,height,angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:2,strokeStyle:'solid',roughness:0,opacity:100,groupIds:[],...more});
 const scene={type:'excalidraw',version:2,elements:[shape('frame','frame',-40,-40,240,180,{name:'Frame'}),shape('a','rectangle',0,0,160,90),shape('label','text',15,20,100,32,{text:'[[Native note]]',fontSize:20,fontFamily:2,containerId:'a'}),shape('b','ellipse',460,0,180,100),shape('edge','arrow',160,45,300,0,{points:[[0,0],[300,0]],startBinding:{elementId:'a'},endBinding:{elementId:'b'},endArrowhead:'arrow'}),shape('free','arrow',160,70,190,150,{points:[[0,0],[190,150]],startBinding:{elementId:'a'},endBinding:null,endArrowhead:'arrow'}),shape('image','image',300,250,120,120,{fileId:'embedded'}),shape('note','embeddable',500,230,220,130,{link:'[[Native note#Topic]]'}),shape('pen','freedraw',0,210,160,40,{points:[[0,0],[80,40],[160,0]],pressures:[0.2,0.9,0.3],simulatePressure:false})],files:{embedded:{dataURL:png,mimeType:'image/png'}}};
 const markdown='---\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data\n## Drawing\n```json\n'+JSON.stringify(scene)+'\n```\n';
 const source='Native import.excalidraw.md';await create(source,markdown);
 await importFile(source,{cancel:true});
 const imported=await importFile(source);
 assert.equal(imported.document.nodes.filter(n=>n.type==='file').length,2);
 const image=imported.document.nodes.find(n=>n.file?.endsWith('.png'));
 assert(image,'embedded raster is a native file card');
 assert(await checked(`return !!app.vault.getAbstractFileByPath(${JSON.stringify(image.file)});`));
 const note=imported.document.nodes.find(n=>n.file==='Native note.md');assert.equal(note.subpath,'#Topic');
 const bindings=imported.document.miroCanvas.bindings;
 const idOf=sourceId=>Object.entries(bindings).find(([,b])=>b.sourceId==='excalidraw:'+sourceId)?.[0];
 await gesture('single-card drag',`#import-node-${idOf('a')} .canvas-node-container`,70,40,[idOf('a')]);
 await gesture('frame drag',`#import-node-${idOf('frame')} .canvas-group-label`,60,35,[]);
 await gesture('mixed-selection drag','.miro-canvas-mixed-selection-frame',60,30,[idOf('a'),idOf('b')]);
 await gesture('resize',`.miro-canvas-resizer[data-resize="bottom-right"]`,55,30,[idOf('a')]);
 await gesture('rotation','.miro-canvas-handle--rotate',65,40,[idOf('a')]);
 await checked(`await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Native note.md'),{active:true});await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(imported.board)}),{active:true});return true;`);await wait(400);
 receipt.checks.push({name:'reopen',board:imported.board});
 await click('.miro-canvas-dock__button:has(.lucide-search)');
 await client.send('Input.insertText',{text:'Импорт'});
 await until("return document.querySelector('.miro-canvas-search')?.dataset.searchState==='found';");
 receipt.checks.push({name:'board search reads imported note heading'});
 await pressKey(client.send,'Escape');
 const links=await until(`const resolved=app.metadataCache.resolvedLinks[${JSON.stringify(imported.board)}];return resolved?.['Native note.md']?{resolved}:false;`);
 await checked("const leaf=app.workspace.getRightLeaf(false);await leaf.setViewState({type:'backlink'});app.workspace.rightSplit.expand();await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Native note.md'),{active:true});return true;");
 const pane=await until(`return app.workspace.getLeavesOfType('backlink').some(l=>l.view.containerEl.textContent.includes(${JSON.stringify(imported.board.replace('.canvas',''))}));`);
 receipt.checks.push({name:'native resolved-links and actual backlinks pane',...links,paneRow:true,graphUI:false});
 await checked(`await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(imported.board)}),{active:true});return true;`);await wait(500);

 await checked("app.plugins.plugins['miro-canvas'].m1Session.openExport();return true;");
 const exportResult=await checked(`const p=app.plugins.plugins['miro-canvas'],s=p.m1Session;const original=await app.vault.read(app.workspace.getActiveFile());const before=app.vault.getFiles().map(f=>f.path);const notices=[],notice=s.options.onNotice;s.options.onNotice=m=>notices.push(m);try{s.exporting.state={...s.exporting.state,format:'free',pages:[{id:'import-page',name:'Import',x:-50,y:-50,width:800,height:470}]};s.renderExport();await s.runExport('svg');const svgFile=app.vault.getFiles().find(f=>!before.includes(f.path)&&f.extension==='svg');s.exporting.rendering='raster';await s.runExport('pdf');const f=app.vault.getFiles().find(f=>!before.includes(f.path)&&f.extension==='pdf');if(!f)throw Error('PDF was not created: '+JSON.stringify(notices));const bytes=new Uint8Array(await app.vault.readBinary(f));if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw Error('invalid PDF');if(await app.vault.read(app.workspace.getActiveFile())!==original)throw Error('export changed board');if(p.exportJobs.size||document.querySelector('.miro-canvas-export-renderer'))throw Error('export cleanup failed');s.closeExport();return {path:f.path,bytes:bytes.length,sourceUnchanged:true,jobsClean:true,svgCreated:!!svgFile,notices};}finally{s.options.onNotice=notice;}`);
 receipt.checks.push({name:'independent raster PDF export; SVG limitation recorded',input:'instrumented export setup/call; native renderer/save',...exportResult});

 await checked("await app.plugins.disablePlugin('miro-canvas');return true;");await wait(250);
 const fallback=await checked('return {nodes:app.workspace.activeLeaf.view.canvas.nodes.size,edges:app.workspace.activeLeaf.view.canvas.edges.size};');
 assert.equal(fallback.nodes,imported.document.nodes.length);assert.equal(fallback.edges,imported.document.edges.length);
 receipt.checks.push({name:'plugin-off native fallback',...fallback});
 await checked("await app.plugins.enablePlugin('miro-canvas');return true;");await wait(400);
 const copied=await importFile(imported.board,{report:false});
 assert.deepEqual(copied.document,JSON.parse(await checked(`return await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(imported.board)}));`)));
 const tldr=readFileSync(new URL('../../tests/fixtures/import/tldraw-current-schema.tldr',import.meta.url),'utf8');await create('Actual tldraw.tldr',tldr);
 // A marked wrapper allows a genuine command-palette gesture in a native Markdown view.
 const wrapped='---\ntldraw-file: true\n---\n```json\n!!!_START_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!\n'+JSON.stringify({meta:{'plugin-version':'1.32.0','tldraw-version':'5.4.0'},raw:JSON.parse(tldr)})+'\n!!!_END_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!\n```';
 await create('Actual tldraw.tldr.md',wrapped);const tl=await importFile('Actual tldraw.tldr.md',{report:false});assert.equal(tl.document.nodes.length,2);
 receipt.checks.push({name:'tldraw real raw fixture in synthetic wrapper',board:tl.board});
 const ac={nodes:[{id:'g',type:'group',x:0,y:0,width:400,height:260,label:'Compact',collapsed:true},{id:'a',type:'text',x:30,y:50,width:120,height:80,text:'Child',styleAttributes:{shape:'diamond'}}],edges:[],metadata:{version:'1.0-1.0',startNode:'g'}};
 await create('Advanced native.canvas',JSON.stringify(ac));const advanced=await importFile('Advanced native.canvas',{report:false});assert(advanced.document.miroCanvas.localOverrides.g.groupCollapse);assert.equal(advanced.document.nodes[0].width,400);assert.deepEqual(advanced.document.miroCanvas.localOverrides.g.groupCollapse.children,['a']);
 receipt.checks.push({name:'Advanced Canvas compact snapshot without persisted preview',board:advanced.board});
 await checked("await app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]);app.workspace.leftSplit.expand();return true;");await wait(250);
 const menuPoint=await checked("const e=document.querySelector('.nav-file-title[data-path=\"Actual tldraw.tldr.md\"]');if(!e)throw Error('file menu target missing');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+40,y:r.y+r.height/2};");
 await mouse('mousePressed',menuPoint.x,menuPoint.y,'right',2);await mouse('mouseReleased',menuPoint.x,menuPoint.y,'right');await wait(150);
 await checked("const e=[...document.querySelectorAll('.menu-item')].find(e=>e.textContent.includes('Import into a board'));if(!e)throw Error('file import menu missing');e.id='import-file-menu-entry';return true;");await click('#import-file-menu-entry');
 await until("return !!document.querySelector('.miro-canvas-import-preview-modal');");
 await click('.miro-canvas-import-preview .mod-cta');const rawBoard=await until("const f=app.workspace.getActiveFile();return f?.extension==='canvas'&&f.basename.startsWith('Actual tldraw')?f.path:false;");
 receipt.checks.push({name:'marked-note file-menu import',board:rawBoard});
 await checked("await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Native note.md'),{active:true});return true;");
 await pressKey(client.send,'p',{modifiers:2});await until("return !!document.querySelector('.prompt-input');");await client.send('Input.insertText',{text:'Import into a board'});await wait(180);await pressKey(client.send,'Enter');
 await until("return !!document.querySelector('.miro-canvas-import-source-picker');");
 const sourceFilesBefore=await checked('return app.vault.getFiles().map(f=>f.path).sort();');await pressKey(client.send,'Escape');assert.deepEqual(await checked('return app.vault.getFiles().map(f=>f.path).sort();'),sourceFilesBefore);
 receipt.checks.push({name:'source-picker cancellation writes nothing'});
 await pressKey(client.send,'p',{modifiers:2});await until("return !!document.querySelector('.prompt-input');");await client.send('Input.insertText',{text:'Import into a board'});await wait(180);await pressKey(client.send,'Enter');await until("return !!document.querySelector('.miro-canvas-import-source-picker');");
 await client.send('Input.insertText',{text:'Actual tldraw.tldr'});await wait(200);await pressKey(client.send,'Enter');await until("return !!document.querySelector('.miro-canvas-import-preview-modal');");await click('.miro-canvas-import-preview .mod-cta');const picked=await until("const f=app.workspace.getActiveFile();return f?.extension==='canvas'&&f.basename.startsWith('Actual tldraw')?f.path:false;");
 const pickedDoc=await checked(`return JSON.parse(await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(picked)})));`);
 assert(Object.values(pickedDoc.miroCanvas.bindings).some(b=>b.sourceId==='import:Actual tldraw.tldr'));
 receipt.checks.push({name:'raw tldr source picker without editor or visible extension',board:picked});
 receipt.passed=true;
} catch(error) { receipt.error=String(error.stack??error);await mouse('mouseReleased',0,0);process.exitCode=1; }
finally { writeFileSync(new URL('receipt.json',out),JSON.stringify(receipt,null,2));client.close(); }
console.log(JSON.stringify({passed:receipt.passed,checks:receipt.checks.length,error:receipt.error}));
