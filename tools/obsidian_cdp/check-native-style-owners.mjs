// Real native DOM, with explicit CDP state/foreign-style instrumentation.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { connectByTitle, evaluate } from './cdp.mjs';
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
assert.ok(args.includes('--port'));
const serial = args.includes('--serial') ? value('--serial') : undefined;
const { send, close } = await connectByTitle(Number(value('--port')), serial ? 'Obsidian' : undefined);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { device: serial ?? 'Windows', input: 'CDP native API and foreign inline-style instrumentation; no OS input', passed: false };
const bridge = await build({stdin:{contents:"export {NativeStyleProperties} from './src/native-style-properties';export {projectNativeCardStyles} from './src/native-card-styles';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',globalName:'__styleOwnerProof',platform:'browser'});
async function checked(code) {
  const result = await evaluate(send, `const base=app.vault.adapter.getBasePath?.().split(String.fromCharCode(92)).join('/');if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!base?.includes('/tools/obsidian_cdp/.out/')||require('@electron/remote').getCurrentWindow().isVisible())throw Error('hidden isolated Windows or Android test vault required');${code}`);
  if (result?.error) throw Error(result.error);
  return result;
}
async function ensureNativeContent(id) {
  const state = await checked(`const c=app.workspace.activeLeaf.view.canvas,n=c.nodes.get(${JSON.stringify(id)});
    if(!n||typeof n.getBBox!=='function'||typeof c.zoomToBbox!=='function'||typeof c.setViewport!=='function')throw Error('native card viewport API unavailable');
    c.zoomToBbox(n.getBBox());if(![c.tx,c.ty,c.tZoom].every(Number.isFinite))throw Error('native card viewport target invalid');c.setViewport(c.tx,c.ty,c.tZoom);
    const started=performance.now();let state;
    do{await new Promise(r=>setTimeout(r,50));const r=n.nodeEl.getBoundingClientRect(),v=c.wrapperEl.getBoundingClientRect(),s=app.plugins.plugins['miro-canvas'].m1Session;
      state={id:n.id,elapsed:performance.now()-started,zoom:c.zoom,scale:c.scale,zoomBreakpoint:c.zoomBreakpoint,visible:n.nodeEl.isConnected&&r.width>0&&r.right>v.left&&r.left<v.right&&r.bottom>v.top&&r.top<v.bottom,sizers:n.nodeEl.querySelectorAll('.markdown-preview-view > .markdown-preview-sizer').length,ordinaryM1Owners:[...s.appearanceSizerStyles.elements].filter(e=>n.nodeEl.contains(e)).length};
      if(state.visible&&(${JSON.stringify(id === 'deck' || id === 'group')}||state.sizers>0)&&(${JSON.stringify(id !== 'ordinary')}||state.ordinaryM1Owners>0))return state;
    }while(performance.now()-started<5000);throw Error('native card content readiness timeout '+JSON.stringify(state));`);
  (report.nativeContent ??= []).push(state);
  return state;
}
const kinds = ['shape','text','sticky','table','code','document','embed','deck','group','mindmap','drawing','ordinary'];
const board = {
  nodes: kinds.map((id,index) => ({id,type: ['deck','group'].includes(id)?'group':'text',text:id==='table'?'| A | B |\n| --- | --- |\n| 1 | 2 |':id==='code'?'```js\nconst answer = 42;\n```':id==='sticky'?'<p><span style="font-size:40px;line-height:2">Fitted text</span></p>':id,x:(index%4)*300,y:Math.floor(index/4)*240,width:240,height:180})), edges: [],
  miroSource: { future:{keep:true},items: [
    {id:'shape',type:'shape',data:{shape:'rectangle'},style:{fillColor:'#cceedd'}},
    {id:'text',type:'text'}, {id:'sticky',type:'sticky_note',style:{fillColor:'#ffee99'}},
    {id:'code',type:'code',data:{title:'Example',language:'JavaScript',code:'const answer = 42;'}},
    {id:'document',type:'document',data:{title:'Example.pdf'}}, {id:'embed',type:'embed',data:{providerName:'Test'}},
    {id:'deck',type:'slide_container'}, {id:'group',type:'group'},
    {id:'mindmap',type:'mindmap_node',data:{isRoot:true,nodeView:{data:{content:'Root'}}},style:{nodeColor:'#aaccff'}},
  ] },
  miroCanvas:{schemaVersion:1,localOverrides:{
    table:{item:{type:'table',title:'Table'}}, drawing:{item:{type:'drawing',stroke:{points:[0,0,240,180],box:{width:240,height:180},opacity:1,color:'#334455',width:3}}},
    ordinary:{typography:{verticalAlign:'center'}},
  },future:{keep:true}}, future:{keep:true},
};
let saved;
try {
  saved = await checked('const f=app.workspace.getActiveFile();return {path:f.path,text:await app.vault.read(f),theme:app.vault.getConfig("theme")};');
  const path = `L20 native style owners ${Date.now()}.canvas`;
  await checked(`const f=await app.vault.create(${JSON.stringify(path)},${JSON.stringify(JSON.stringify(board))});await app.workspace.getLeaf(false).openFile(f,{active:true});const c=app.workspace.activeLeaf.view.canvas;c.zoomToBbox({minX:-50,minY:-50,maxX:1200,maxY:750});c.setViewport(c.tx,c.ty,c.tZoom);return true;`);
  await wait(1200);
  report.paint = [];
  for (const theme of ['obsidian','moonstone']) {
    await checked(`app.changeTheme(${JSON.stringify(theme)});app.updateTheme();return true;`);
    await wait(350);
    const rows = [];
    for (const id of kinds) {
      await ensureNativeContent(id);
      rows.push(await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get(${JSON.stringify(id)});return {id:n.id,kind:n.nodeEl.getAttribute('data-miro-source-kind'),classes:n.nodeEl.className,paint:[n.nodeEl,...n.nodeEl.querySelectorAll('.canvas-node-container,.canvas-node-content,.markdown-preview-view')].map(e=>({classes:e.className,background:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderStyle})),sizers:[...n.nodeEl.querySelectorAll('.markdown-preview-sizer')].map(e=>({flex:e.style.flex,minHeight:e.style.minHeight,padding:e.style.paddingBottom,height:getComputedStyle(e).height})),fitted:[...n.nodeEl.querySelectorAll('span')].map(e=>({font:e.style.fontSize,line:e.style.lineHeight}))};`));
    }
    assert.equal(rows.length,kinds.length);
    for (const id of ['shape','drawing','table','code','group','mindmap']) {
      const row=rows.find(r=>r.id===id);
      assert.ok(row.classes.includes('miro-source-'),`missing native decoration ${id}`);
      for (const surface of row.paint.filter(surface=>(id!=='group'||!surface.classes.includes('canvas-node-group'))&&(id!=='drawing'||!surface.classes.includes('markdown-preview-view')))) assert.equal(surface.background,'rgba(0, 0, 0, 0)',`${id} ${surface.classes} native paint`);
    }
    const ordinary=rows.find(r=>r.id==='ordinary');
    assert.ok(ordinary.sizers.length>0,'actual ordinary native Markdown sizer');
    assert.equal(ordinary.sizers[0].flex,'0 0 auto');
    assert.equal(ordinary.sizers[0].minHeight,'0px');
    assert.equal(ordinary.sizers[0].padding,'0px');
    report.paint.push({theme,rows});
  }
  report.visibility=await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,controls=s.root.querySelector('.canvas-controls'),menu=s.root.querySelector('.canvas-menu:not(.miro-canvas-toolbar__native-snapshot)');if(!controls||!menu)throw Error('native controls/menu absent');controls.style.setProperty('display','flex','important');await new Promise(r=>setTimeout(r,60));if(controls.style.getPropertyValue('display')!=='none'||controls.style.getPropertyPriority('display')!=='')throw Error('native controls writer not reconciled');const originalDisplay=menu.style.getPropertyValue('display'),originalHidden=menu.getAttribute('hidden');for(const mode of ['is-screenshotting','miro-canvas-presenting']){s.root.classList.add(mode);await new Promise(r=>setTimeout(r,40));if(getComputedStyle(menu).display!=='none'||menu.getClientRects().length)throw Error('native menu capture/presentation visible');menu.style.setProperty('display','inline-flex','important');await new Promise(r=>setTimeout(r,40));if(menu.style.getPropertyValue('display')!=='none')throw Error('foreign menu show not reconciled');s.root.classList.remove(mode);await new Promise(r=>setTimeout(r,40));if(menu.style.getPropertyValue('display')!=='inline-flex'||menu.style.getPropertyPriority('display')!=='important')throw Error('latest external menu intent lost');}menu.style.setProperty('display',originalDisplay);if(originalHidden===null)menu.removeAttribute('hidden');else menu.setAttribute('hidden',originalHidden);return {actualNativeElements:true,controlsCompetition:true,presentationCapture:true,latestExternalPriorityRestored:true};`);
  await ensureNativeContent('group');
  report.group=await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('group').nodeEl,face=n.querySelector(':scope > .canvas-node-container'),before={width:getComputedStyle(face).borderTopWidth,style:getComputedStyle(face).borderTopStyle};n.classList.add('is-focused');const selectedStyle=getComputedStyle(face),selected={width:selectedStyle.borderTopWidth,style:selectedStyle.borderTopStyle},declaration={width:selectedStyle.getPropertyValue('--miro-source-group-border-width').trim(),style:selectedStyle.getPropertyValue('--miro-source-group-border-style').trim()};n.classList.remove('is-focused');const after={width:getComputedStyle(face).borderTopWidth,style:getComputedStyle(face).borderTopStyle};const expectedFace=document.createElement('div');expectedFace.style.cssText='position:fixed;left:-10000px;border:1px dashed transparent';document.body.appendChild(expectedFace);let expectedSelected;try{const expectedStyle=getComputedStyle(expectedFace);expectedSelected={width:expectedStyle.borderTopWidth,style:expectedStyle.borderTopStyle};}finally{expectedFace.remove();}return {before,selected,after,declaration,expectedSelected};`);
  assert.equal(report.group.declaration.width,'1px');
  assert.equal(report.group.declaration.style,'dashed');
  assert.deepEqual(report.group.selected,report.group.expectedSelected);
  assert.deepEqual(report.group.after,report.group.before);
  // Separate pure-helper CSSOM evidence in the actual host, including teardown.
  report.cssom = await checked(`${bridge.outputFiles[0].text};
    const {NativeStyleProperties:Owner,projectNativeCardStyles:project}=__styleOwnerProof;
    const fixture=kind=>{const root=document.createElement('div');root.className='miro-source-'+kind;root.innerHTML='<div class="canvas-node-container"><div class="markdown-preview-view"><div class="markdown-preview-sizer"></div></div></div>';return root;};
    const apply=(root,owner)=>project(root,(e,k,v,x)=>owner.write(e,k,v,x));
    const table=fixture('table'),sizer=table.querySelector('.markdown-preview-sizer');sizer.style.cssText='padding:12px !important';
    const m1=new Owner(),source=new Owner();for(const [key,value] of [['flex','0 0 auto'],['min-height','0'],['padding-bottom','0']])m1.write(sizer,key,value);apply(table,source);source.restore();m1.restore();
    if(['top','right','bottom','left'].some(side=>sizer.style.getPropertyValue('padding-'+side)!=='12px'||sizer.style.getPropertyPriority('padding-'+side)!=='important'))throw Error('table padding restoration');
    const colors=[];for(const [kind,initial,property] of [['embed','background:red','background-color'],['slide','border:3px dashed red','border-color']]){const root=fixture(kind),face=root.firstElementChild,owner=new Owner();face.style.cssText=initial;apply(root,owner);face.style.setProperty(property,'blue','important');owner.refresh(face);owner.restore();if(face.style.getPropertyValue(property)!=='blue'||face.style.getPropertyPriority(property)!=='important')throw Error(kind+' latest native color restoration');colors.push(kind);}
    return {tablePaddingRestored:true,latestNativeColorAndPriority:colors,input:'compiled pure helpers with actual host CSSOM; distinct from installed plugin lifecycle'};`);
  await ensureNativeContent('code');
  report.replacement = await checked(`const session=app.plugins.plugins['miro-canvas'].m1Session,c=app.workspace.activeLeaf.view.canvas,n=c.nodes.get('code'),shell=n.nodeEl;
    const item=()=>session.sourceRenderer.cardItems.find(i=>i.id==='code');const initial=[...item().styleOwnership.elements].length;const history=c.history.current;
    for(let i=0;i<100;i++){const preview=shell.querySelector('.markdown-preview-view');if(!preview)throw Error('native code preview absent');preview.replaceWith(preview.cloneNode(true));await Promise.resolve();await Promise.resolve();if([...item().styleOwnership.elements].length>initial)throw Error('retained detached code targets');}
    const current=[...item().styleOwnership.elements];if(current.some(e=>e!==shell&&!shell.contains(e)))throw Error('detached source owner');if(c.history.current!==history)throw Error('content replacement added history');
    return {replacements:100,sourceTargets:current.length,initialSourceTargets:initial,historyUnchanged:c.history.current===history};`);
  await ensureNativeContent('ordinary');
  report.replacement = { ...report.replacement, ...await checked(`const session=app.plugins.plugins['miro-canvas'].m1Session,c=app.workspace.activeLeaf.view.canvas,history=c.history.current;
    const ordinary=c.nodes.get('ordinary').nodeEl;const owners=()=>[...session.appearanceSizerStyles.elements],count=owners().length;
    if(!owners().some(e=>ordinary.contains(e)))throw Error('active ordinary M1 sizer owner missing');
    for(let i=0;i<100;i++){const preview=ordinary.querySelector('.markdown-preview-view');preview.replaceWith(preview.cloneNode(true));await new Promise(r=>requestAnimationFrame(r));if([...session.appearanceSizerStyles.elements].length>count)throw Error('retained detached ordinary sizers');}
    const current=owners();if(!current.some(e=>ordinary.contains(e)))throw Error('active ordinary M1 sizer owner lost');if(current.some(e=>!session.root.contains(e)))throw Error('detached M1 sizer owner');if(c.history.current!==history)throw Error('ordinary replacement added history');
    return {replacements:200,initialM1Sizers:count,currentM1Sizers:current.length,ordinaryM1Sizers:current.filter(e=>ordinary.contains(e)).length,m1HistoryUnchanged:true};`) };
  const integrity=await checked(`const c=app.workspace.activeLeaf.view.canvas,d=c.getData();return {source:d.miroSource,future:d.future,metadataFuture:d.miroCanvas.future,history:c.history.current};`);
  assert.deepEqual(integrity.source,board.miroSource);
  assert.deepEqual(integrity.future,board.future);
  assert.deepEqual(integrity.metadataFuture,board.miroCanvas.future);
  report.integrity=integrity;
  report.passed=true;
} finally {
  if(saved) {
    await checked(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(saved.path)});await app.workspace.getLeaf(false).openFile(f,{active:true});app.changeTheme(${JSON.stringify(saved.theme)});app.updateTheme();return true;`);
    await wait(600);
    assert.equal(await checked(`return await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(saved.path)}))===${JSON.stringify(saved.text)};`),true,'original bytes unchanged');
  }
  mkdirSync(new URL('./.out/l20-native/',import.meta.url),{recursive:true});
  writeFileSync(new URL(`./.out/l20-native/styles-${serial??'Windows'}.json`,import.meta.url),JSON.stringify(report,null,2));
  close();
}
console.log(`OK ${serial??'Windows'} native style owners`);
