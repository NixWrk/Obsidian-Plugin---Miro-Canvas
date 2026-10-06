// L02/L03/L04 Android regressions through real ADB input. MiroCanvasTest only.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { connectByTitle, evaluate } from "./cdp.mjs";
const args=process.argv.slice(2);
const option=name=>args[args.indexOf(name)+1];
assert.ok(args.includes('--serial')&&args.includes('--port'),'--serial and --port required');
const serial=option('--serial');
const port=Number(option('--port'));
const only=args.includes('--only')?option('--only'):null;
assert.ok(only===null||['menus','panels','navigation','drawing'].includes(only),'unknown --only section');
const adb=process.env.ADB??'C:/Program Files/VirtualTablet Server/adb/adb.exe';
const run=promisify(execFile);
const {send,close}=await connectByTitle(port,'Obsidian');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const out=new URL('./.out/',import.meta.url);
mkdirSync(out,{recursive:true});
async function checked(code){
  const r=await evaluate(send,`if(app.vault.getName()!=='MiroCanvasTest')throw Error('test vault required');${code}`);
  if(r?.error)throw Error(r.error);
  return r;
}
async function shell(command){return (await run(adb,['-s',serial,'shell',command],{timeout:12000,windowsHide:true})).stdout.trim();}
async function point(selector){
  return checked(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});
    const r=e.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};
    if(!e.contains(document.elementFromPoint(p.x,p.y)))throw Error('covered '+${JSON.stringify(selector)});return p;`);
}
async function pixels(p){const d=await checked('return devicePixelRatio;');return {x:Math.round(p.x*d),y:Math.round(p.y*d)};}
async function tap(p,source='touchscreen'){
  const at=await pixels(p);
  await shell(`input ${source} tap ${at.x} ${at.y}`);
  await wait(240);
}
async function tapSelector(selector){await tap(await point(selector));}
async function shot(name){
  const r=await run(adb,['-s',serial,'exec-out','screencap','-p'],{encoding:'buffer',maxBuffer:20*1024*1024,timeout:12000,windowsHide:true});
  writeFileSync(new URL(`lint-android-${serial}-${name}.png`,out),r.stdout);
}
async function more(){
  for(let attempt=0;attempt<3;attempt++){
    if(await checked(`return document.querySelector('.miro-canvas-toolbar__button--more').getAttribute('aria-expanded');`)==='true')break;
    let at=await point('.miro-canvas-toolbar__button--more');
    let stable=0;
    for(let sample=0;sample<15&&stable<3;sample++){
      await wait(100);
      const next=await point('.miro-canvas-toolbar__button--more');
      stable=Math.hypot(next.x-at.x,next.y-at.y)<0.5?stable+1:0;
      at=next;
    }
    const start=await checked('return window.__androidLintEvents.length;');
    await tap(at);
    const opened=await checked(`return document.querySelector('.miro-canvas-toolbar__button--more').getAttribute('aria-expanded');`);
    if(opened==='true')break;
    const events=await checked(`return window.__androidLintEvents.slice(${start});`);
    assert.ok(!events.some(e=>e.type==='pointerdown'&&e.target?.includes('button--more')),'a delivered More press must open its panel');
    console.log(`NOTE ${serial}: Android toolbar reflow moved the target before ADB delivery; reacquiring More`);
  }
  assert.equal(await checked(`return document.querySelector('.miro-canvas-toolbar__button--more').getAttribute('aria-expanded');`),'true');
  await wait(800);
  const bounds=await checked(`const b=document.querySelector('.miro-canvas-toolbar__button--more'),p=b.parentElement.querySelector('.miro-canvas-toolbar__panel').getBoundingClientRect(),r=app.plugins.plugins['miro-canvas'].m1Session.root.getBoundingClientRect();return {left:p.left,right:p.right,boardLeft:r.left,boardRight:Math.min(r.right,innerWidth)};`);
  assert.ok(bounds.left>=bounds.boardLeft+7&&bounds.right<=bounds.boardRight-7,'More must fit after placement/content settles: '+JSON.stringify(bounds));
}
async function menuState(){
  return checked(`const slot=document.querySelector('.miro-canvas-toolbar__native'),menu=slot.querySelector('.canvas-menu:not(.miro-canvas-toolbar__native-snapshot)');
    const live=menu.children.length>0;return {live,mirror:slot.getAttribute('data-miro-native-menu'),visible:slot.getAttribute('data-miro-native-visible'),
    width:slot.getBoundingClientRect().width,duplicates:[...menu.querySelectorAll('button')].filter(b=>b.querySelector(':scope > .lucide-palette, :scope > .lucide-arrow-right')).map(b=>getComputedStyle(b).display)};`);
}
async function nodePoint(){return checked(`const r=app.workspace.activeLeaf.view.canvas.nodes.get('a').nodeEl.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);}
async function panelState(){
  return checked(`const s=app.plugins.plugins['miro-canvas'],b=document.querySelector('.miro-canvas-tools .miro-canvas-panel-toggle'),r=b.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,moving:b.getAttribute('data-panel-moving'),layout:JSON.stringify(s.canvasSettings.panelLayout),
    position:s.canvasSettings.panelLayout.toolbar,marquee:!!document.querySelector('.miro-canvas-rectangle-marquee')};`);
}
async function heldPanelDrag(cancel=false){
  await point('.miro-canvas-tools .miro-canvas-panel-toggle');
  const before=await panelState();
  const first=await pixels(before);
  const last=await pixels({x:before.x+60,y:before.y+75});
  const nativeHold=Number(await shell('settings get secure long_press_timeout'));
  // Older Android starts its drag at 400 ms and jumps along the timed route.
  // A slower route keeps that first jump inside the panel's 8 px hold slop.
  const duration=nativeHold<450?6500:1200;
  const command=`input touchscreen draganddrop ${first.x} ${first.y} ${last.x} ${last.y} ${duration}`;
  const child=spawn(adb,['-s',serial,'shell',command],{windowsHide:true});
  let output='';
  child.stdout.on('data',d=>output+=d);
  child.stderr.on('data',d=>output+=d);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(output)));});
  let finished=false;
  done.then(()=>{finished=true;},()=>{finished=true;});
  const deadline=Date.now()+duration+2500;
  let preview=await panelState();
  while(!finished&&Date.now()<deadline&&(preview.moving!=='true'||Math.hypot(preview.x-before.x,preview.y-before.y)<=20)){
    await wait(120);
    preview=await panelState();
  }
  if(cancel&&!finished){
    const at=await pixels(preview);
    await shell(`input touchscreen motionevent CANCEL ${at.x} ${at.y}`);
  }
  await done;
  await wait(250);
  const after=await panelState();
  if(preview.moving!=='true'||Math.hypot(preview.x-before.x,preview.y-before.y)<=20)console.log(JSON.stringify({cancel,before,preview,after,events:await checked('return window.__androidLintEvents.slice(-12);')}));
  assert.equal(preview.moving,'true','450 ms hold must arm the drag');
  assert.ok(Math.hypot(preview.x-before.x,preview.y-before.y)>20,'panel must follow before release');
  assert.equal(preview.layout,before.layout,'preview must not save preferences');
  assert.equal(preview.marquee,false);
  assert.equal(after.moving,null,'release/cancel must clear moving state');
  if(cancel){assert.equal(after.layout,before.layout);assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<1);}
  else{assert.notEqual(after.layout,before.layout);assert.equal(after.position.collapsed,before.position.collapsed);}
}
async function count(){return checked('return app.workspace.activeLeaf.view.canvas.nodes.size;');}
async function history(){return checked('return app.workspace.activeLeaf.view.canvas.history.current;');}
async function doubleTap(p,source){
  const at=await pixels(p);
  await shell(`input ${source} tap ${at.x} ${at.y}; sleep 0.08; input ${source} tap ${at.x} ${at.y}`);
  await wait(850);
}
const board={nodes:[{id:'a',type:'text',text:'Android card',x:0,y:0,width:220,height:140},{id:'b',type:'text',text:'Second card',x:420,y:0,width:220,height:140}],
 edges:[{id:'edge',fromNode:'a',fromSide:'right',toNode:'b',toSide:'left'}],
 miroCanvas:{schemaVersion:1,connectors:{free:{id:'free',from:{type:'free',x:50,y:260},to:{type:'free',x:550,y:260},route:'straight',width:3,startCap:'none',endCap:'arrow',color:'#789abc'}}}};
let saved;
let originalRotation;
try{
  saved=await checked(`const f=app.workspace.getActiveFile();return {file:f?.path,text:f?await app.vault.read(f):null,theme:app.vault.getConfig('theme'),settings:app.plugins.plugins['miro-canvas'].canvasSettings};`);
  originalRotation={auto:await shell('settings get system accelerometer_rotation'),rotation:await shell('settings get system user_rotation')};
  await checked(`const p=app.plugins.plugins['miro-canvas'];p.m1Session?.resetTools();p.m1Session?.closeExport();
    await p.saveCanvasSettings({fingerDrawing:true,penPressure:false,minimapVisible:true,holdStraightLine:false,hiddenPanelButtons:[],panelLayout:{},toolbarItems:['select','text','sticky','shape','pen','connector']});
    const f=await app.vault.create(${JSON.stringify(`Android lint ${serial} ${Date.now()}.canvas`)},${JSON.stringify(JSON.stringify(board))});
    await app.workspace.getLeaf(false).openFile(f,{active:true});app.workspace.leftSplit?.collapse();app.workspace.rightSplit?.collapse();return true;`);
  await checked(`await app.plugins.disablePlugin('miro-canvas');window.__androidLintEvents=[];
    window.__androidLintPointer=e=>window.__androidLintEvents.push({type:e.type,kind:e.pointerType,t:e.timeStamp,x:e.clientX,y:e.clientY,target:e.target.closest?.('button')?.getAttribute('class'),button:e.button});
    window.addEventListener('pointerdown',window.__androidLintPointer,true);window.addEventListener('pointerup',window.__androidLintPointer,true);window.addEventListener('pointermove',window.__androidLintPointer,true);
    await app.plugins.enablePlugin('miro-canvas');return true;`);
  await wait(850);
  await checked(`app.workspace.activeLeaf.view.canvas.zoomToFit();return true;`);
  await wait(400);
  if(only===null||only==='menus'){
  for(const theme of ['obsidian','moonstone']){
    await checked(`app.changeTheme(${JSON.stringify(theme)});app.updateTheme();app.plugins.plugins['miro-canvas'].m1Session.resetTools();return true;`);
    await tap(await nodePoint());
    await wait(800);
    assert.deepEqual(await checked('return [...app.workspace.activeLeaf.view.canvas.selection].map(n=>n.id);'),['a']);
    await more();
    const card=await menuState();
    assert.equal(card.mirror,String(card.live));
    assert.equal(card.visible,'true');
    assert.ok(card.width>0);
    assert.ok(card.duplicates.length>0);
    assert.ok(card.duplicates.every(d=>d==='none'));
    await tapSelector('.miro-canvas-toolbar__button--more');
    await more();
    await shot(`menu-${theme}`);
    await checked(`app.plugins.plugins['miro-canvas'].m1Session.resetTools();return true;`);
    const edge=await checked(`const p=app.workspace.activeLeaf.view.canvas.edges.get('edge').lineGroupEl.querySelector('.canvas-interaction-path'),a=p.getPointAtLength(p.getTotalLength()/2),m=p.getScreenCTM();return {x:m.a*a.x+m.c*a.y+m.e,y:m.b*a.x+m.d*a.y+m.f};`);
    await tap(edge);
    await wait(800);
    assert.deepEqual(await checked('return [...app.workspace.activeLeaf.view.canvas.selection].map(n=>n.id);'),['edge']);
    await more();
    const line=await menuState();
    assert.equal(line.mirror,String(line.live));
    assert.ok(line.duplicates.length>0);
    assert.ok(line.duplicates.every(d=>d==='none'));
    await checked(`app.plugins.plugins['miro-canvas'].m1Session.resetTools();return true;`);
    await tap(await point('.miro-board-connector-hit[data-connector-id="free"]'));
    await more();
    assert.equal(await checked(`const s=document.querySelector('.miro-canvas-toolbar__native'),d=s.querySelector('.miro-canvas-toolbar__button--delete');return !d.hidden&&s.getBoundingClientRect().width>0;`),true);
    console.log(`OK ${serial} ${theme}: card/edge menus, duplicate buttons and independent Delete by real ADB touch`);
  }
  }
  const untouched=await checked('return app.workspace.activeLeaf.view.canvas.getData();');
  assert.deepEqual(untouched.nodes,board.nodes);
  assert.deepEqual(untouched.edges,board.edges);
  await checked(`app.plugins.plugins['miro-canvas'].m1Session.resetTools();return true;`);
  if(only===null||only==='panels'){
  for(const orientation of ['horizontal','vertical']){
    for(const collapsed of [false,true]){
      await checked(`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({panelLayout:{toolbar:{anchor:'top-left',dx:20,dy:100,orientation:${JSON.stringify(orientation)},collapsed:${collapsed}}}});return true;`);
      await wait(550);
      await heldPanelDrag();
      await heldPanelDrag(true);
      console.log(`OK ${serial} ${orientation} collapsed=${collapsed}: held drag and cancel`);
    }
  }
  console.log(`OK ${serial}: held open/folded panel drag, preview, release and CANCEL in both orientations via Android draganddrop/CANCEL`);
  }
  await checked(`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({panelLayout:{}});app.plugins.plugins['miro-canvas'].m1Session.resetTools();return true;`);
  if(only===null||only==='navigation'){
  const beforeNavigation=await checked(`return app.plugins.plugins['miro-canvas'].m1Session.viewport.getViewport();`);
  const map=await point('.miro-canvas-dock__map');
  await tap(map);
  const at=await pixels(map),end=await pixels({x:map.x+14,y:map.y+8});
  await shell(`input touchscreen swipe ${at.x} ${at.y} ${end.x} ${end.y} 600`);
  await wait(200);
  assert.equal(await checked(`return app.plugins.plugins['miro-canvas'].m1Session.minimapDragStart===undefined;`),true);
  const afterNavigation=await checked(`return app.plugins.plugins['miro-canvas'].m1Session.viewport.getViewport();`);
  assert.notDeepEqual(afterNavigation,beforeNavigation,'real minimap drag must move the view');
  await checked('app.workspace.activeLeaf.view.canvas.zoomToFit();return true;');
  const oldWidth=await checked(`return app.plugins.plugins['miro-canvas'].m1Session.root.clientWidth;`);
  await shell('settings put system accelerometer_rotation 0; settings put system user_rotation 1');
  await wait(1500);
  const landscape=await checked(`const root=app.plugins.plugins['miro-canvas'].m1Session.root;return {width:innerWidth,height:innerHeight,boardWidth:root.clientWidth,panel:document.querySelector('.miro-canvas-tools').getBoundingClientRect().toJSON()};`);
  assert.notEqual(landscape.boardWidth,oldWidth,'rotation must resize the real board');
  assert.ok(landscape.width>landscape.height);
  await shot('landscape');
  console.log(`OK ${serial}: real minimap click/drag and physical viewport rotation`);
  await shell(`settings put system user_rotation ${originalRotation.rotation==='null'?'0':originalRotation.rotation}`);
  await wait(1300);
  await checked(`app.plugins.plugins['miro-canvas'].m1Session.resetTools();return true;`);
  }
  if(only===null||only==='drawing'){
  const blank=await checked(`const r=app.plugins.plugins['miro-canvas'].m1Session.root.getBoundingClientRect(),p={x:r.x+80,y:r.y+150};
    if(document.elementFromPoint(p.x,p.y)?.closest('.canvas-node,.miro-canvas-tools,.miro-canvas-dock'))throw Error('drawing point covered');return p;`);

  for(const source of ['touchscreen','stylus']){
    await tapSelector('.miro-canvas-tools [data-tool-group="drawing"]');
    const base=await count(),h=await history();
    await checked('window.__androidLintEvents.length=0;return true;');
    await tap(blank,source);
    const dotEvents=await checked('return window.__androidLintEvents;');
    assert.ok(dotEvents.some(e=>e.kind===(source==='stylus'?'pen':'touch')),'Android must deliver the requested pointer source');
    await wait(750);
    assert.equal(await count(),base+1,source+' dot');
    assert.equal(await history(),h+1,'one dot must have one history step');
    await tapSelector('.miro-canvas-dock [data-icon="undo-2"]');
    assert.equal(await count(),base);
    await tapSelector('.miro-canvas-dock [data-icon="redo-2"]');
    assert.equal(await count(),base+1);
    await tapSelector('.miro-canvas-dock [data-icon="undo-2"]');
    await checked('window.__androidLintEvents.length=0;return true;');
    await doubleTap(blank,source);
    const doubleEvents=await checked('return window.__androidLintEvents;');
    const downs=doubleEvents.filter(e=>e.type==='pointerdown'),ups=doubleEvents.filter(e=>e.type==='pointerup');
    assert.equal(downs.length,2);
    assert.equal(ups.length,2);
    assert.ok(downs[1].t-ups[0].t<=300,'injected pair must fit the real double-tap interval');
    assert.equal(await count(),base,'double-tap must leave no dot: '+source);
    assert.equal(await checked(`return app.plugins.plugins['miro-canvas'].m1Session.armedTool;`),'select');
    await tapSelector('.miro-canvas-tools [data-tool-group="drawing"]');
    const first=await pixels(blank),last=await pixels({x:blank.x+65,y:blank.y+45});
    const strokeBefore=await history();
    const child=spawn(adb,['-s',serial,'shell',`input ${source} swipe ${first.x} ${first.y} ${last.x} ${last.y} 900`],{windowsHide:true});
    let ended=false;
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{ended=true;code===0?resolve():reject(Error('ADB stroke failed'));});});
    let preview;
    const deadline=Date.now()+4000;
    do{
      await wait(90);
      preview=await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=app.workspace.activeLeaf.view.canvas;return {points:s.penPoints.length,nodes:c.nodes.size,history:c.history.current};`);
    }while(!ended&&Date.now()<deadline&&preview.points<2);
    await done;
    assert.ok(preview.points>=2,'moving stroke preview must exist before release');
    assert.equal(preview.nodes,base,'stroke preview must not create a saved node');
    assert.equal(preview.history,strokeBefore,'stroke preview must not enter history');
    await wait(250);
    assert.equal(await count(),base+1,'one real stroke: '+source);
    assert.equal(await history(),strokeBefore+1,'one stroke history step');
    const strokes=await checked(`const c=app.workspace.activeLeaf.view.canvas.getData();return c.nodes.filter(n=>n.id!=='a'&&n.id!=='b').map(n=>c.miroCanvas.localOverrides[n.id]?.item?.stroke?.points);`);
    assert.ok(strokes.some(p=>p?.length>=4&&Math.hypot(p[p.length-2]-p[0],p[p.length-1]-p[1])>10),'stroke must span its moving input; a straight stroke may simplify to two points');
    await tapSelector('.miro-canvas-dock [data-icon="undo-2"]');
    assert.equal(await count(),base);
    await checked(`app.plugins.plugins['miro-canvas'].m1Session.resetTools();return true;`);
  }
  console.log(`OK ${serial}: touch/pen-source dots and strokes with unsaved preview, one Undo/Redo and double-tap`);
  await checked(`await app.plugins.disablePlugin('miro-canvas');return true;`);
  assert.equal(await checked(`return document.querySelectorAll('[data-miro-native-duplicate]').length;`),0);
  await checked(`await app.plugins.enablePlugin('miro-canvas');return true;`);
  await wait(650);
  await tapSelector('.miro-canvas-tools [data-tool-group="drawing"]');
  const base=await count();
  // Hold a real ADB pen-source dot for the app's double-tap wait, then unload before it can commit.
  const atBlank=await pixels(blank);
  await shell(`input stylus tap ${atBlank.x} ${atBlank.y}`);
  assert.equal(await checked(`return app.plugins.plugins['miro-canvas'].m1Session.pendingPenDot!==undefined;`),true,'dot must still be pending before unloading');
  await checked(`await app.plugins.disablePlugin('miro-canvas');return true;`);
  await wait(800);
  assert.equal(await count(),base,'unload cancels a pending real-device dot');
  await checked(`await app.plugins.enablePlugin('miro-canvas');return true;`);
  console.log(`OK ${serial}: unload/reload restores native buttons and cancels pending dot`);
  }
}catch(error){
  await shot('failed');
  writeFileSync(new URL(`lint-android-${serial}-failure.json`,out),JSON.stringify(await checked('return {file:app.workspace.getActiveFile()?.path,width:innerWidth,height:innerHeight,events:window.__androidLintEvents?.slice(-30)};')));
  throw error;
}finally{
  if(originalRotation){
    await shell(originalRotation.rotation==='null'?'settings delete system user_rotation':`settings put system user_rotation ${originalRotation.rotation}`);
    await shell(originalRotation.auto==='null'?'settings delete system accelerometer_rotation':`settings put system accelerometer_rotation ${originalRotation.auto}`);
    await wait(500);
  }
  await checked(`if(window.__androidLintPointer){window.removeEventListener('pointerdown',window.__androidLintPointer,true);window.removeEventListener('pointerup',window.__androidLintPointer,true);window.removeEventListener('pointermove',window.__androidLintPointer,true);}delete window.__androidLintPointer;delete window.__androidLintEvents;return true;`);
  if(saved){
    await checked(`if(!app.plugins.plugins['miro-canvas'])await app.plugins.enablePlugin('miro-canvas');
      await app.plugins.plugins['miro-canvas'].saveCanvasSettings(${JSON.stringify(saved.settings)});
      app.changeTheme(${JSON.stringify(saved.theme)});app.updateTheme();
      const f=app.vault.getAbstractFileByPath(${JSON.stringify(saved.file??'')});if(f)await app.workspace.getLeaf(false).openFile(f,{active:true});return true;`);
    if(saved.file)assert.equal(await checked(`return await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(saved.file)}));`),saved.text,'previous board must stay unchanged');
  }
  close();
}
