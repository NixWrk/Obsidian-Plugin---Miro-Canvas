// Mandatory L03/L04 regressions. Disposable boards, isolated desktop vault only.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { connectByTitle, connectTarget, evaluate, listTargets, pressKey, screenshot } from "./cdp.mjs";

const port = Number(process.argv[2] ?? 9336);
const out = new URL("./.out/", import.meta.url);
mkdirSync(out, { recursive: true });
let connection = await connectByTitle(port);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function checked(code) {
  const value = await evaluate(connection.send, code);
  if (value?.error) throw Error(value.error);
  return value;
}
async function point(selector) {
  return checked(`const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw Error('missing '+${JSON.stringify(selector)});
    const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
}
async function nodePoint() {
  return checked(`const r=app.workspace.activeLeaf.view.canvas.nodes.get('a').nodeEl.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};`);
}
async function mouse(type, p, button = "left", buttons = 0) {
  await connection.send("Input.dispatchMouseEvent", { type, ...p, button, buttons, clickCount: 1 });
}
async function tap(p) {
  await connection.send("Page.bringToFront");
  await mouse("mousePressed", p, "left", 1);
  await mouse("mouseReleased", p);
  await wait(220);
}
async function openMore() {
  if (await checked(`return document.querySelector('.miro-canvas-toolbar__button--more').getAttribute('aria-expanded');`) !== 'true') {
    await tap(await point('.miro-canvas-toolbar__button--more'));
  }
  assert.equal(await checked(`return document.querySelector('.miro-canvas-toolbar__button--more').getAttribute('aria-expanded');`),'true');
}
async function state() {
  return checked(`const slot=document.querySelector('.miro-canvas-toolbar__native');
    const menu=slot.querySelector('.canvas-menu:not(.miro-canvas-toolbar__native-snapshot)');
    const snap=slot.querySelector('.miro-canvas-toolbar__native-snapshot');
    return {live:menu.children.length>0,mirror:slot.getAttribute('data-miro-native-menu'),
    visible:slot.getAttribute('data-miro-native-visible'),snapshot:snap.hidden,
    snapshotDisplay:getComputedStyle(snap).display,duplicates:[...menu.querySelectorAll('button')].filter(b=>b.querySelector(':scope > .lucide-palette, :scope > .lucide-arrow-right')).map(b=>getComputedStyle(b).display),
    width:document.querySelector('.miro-canvas-toolbar__bar').getBoundingClientRect().width};`);
}
const board = {
  nodes: [{id:"a",type:"text",text:"First card",x:0,y:0,width:220,height:140},
    {id:"b",type:"text",text:"Second card",x:420,y:0,width:220,height:140}],
  edges: [{id:"edge",fromNode:"a",fromSide:"right",toNode:"b",toSide:"left"}],
  miroCanvas: {schemaVersion:1,connectors:{free:{id:"free",from:{type:"free",x:50,y:260},to:{type:"free",x:550,y:260},route:"straight",width:3,startCap:"none",endCap:"arrow",color:"#789abc"}}},
};
let main = connection;
let popout;
try {
  await checked(`const path=app.vault.adapter.getBasePath().split(String.fromCharCode(92)).join('/');
    if(!path.includes('/tools/obsidian_cdp/.out/'))throw Error('isolated test vault required');
    const file=await app.vault.create(${JSON.stringify(`Lint regression ${Date.now()}.canvas`)},${JSON.stringify(JSON.stringify(board))});
    await app.workspace.getLeaf(false).openFile(file,{active:true});
    app.workspace.leftSplit?.collapse();return true;`);
  await wait(700);
  const activeTitle = await checked(`return app.workspace.activeLeaf.containerEl.ownerDocument.title;`);
  const activeTarget = (await listTargets(port)).find(t => t.type === 'page' && t.title === activeTitle);
  assert.ok(activeTarget, 'active board target missing');
  connection = await connectTarget(activeTarget);
  main.close();
  main = connection;
  await connection.send('Page.bringToFront');
  await checked(`app.plugins.plugins['miro-canvas'].m1Session.resetTools();return true;`);
  await checked(`app.workspace.activeLeaf.view.canvas.zoomToFit();return true;`);
  await wait(300);
  for (const theme of ["obsidian", "moonstone"]) {
    await checked(`app.changeTheme(${JSON.stringify(theme)});app.updateTheme();return true;`);
    await tap(await nodePoint());
    await wait(800);
    assert.deepEqual(await checked(`return [...app.workspace.activeLeaf.view.canvas.selection].map(n=>n.id);`),['a']);
    await openMore();
    const before = await state();
    assert.ok(before.width>0,'selection toolbar must be visible');
    assert.equal(before.mirror, String(before.live));
    assert.equal(before.visible, "true");
    assert.ok(before.duplicates.length > 0);
    assert.ok(before.duplicates.every(display => display === "none"));
    writeFileSync(new URL(`lint-menu-${theme}.png`, out), await screenshot(connection.send));
    const pan = await checked(`const r=document.querySelector('.canvas-wrapper').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+100};`);
    await mouse("mousePressed", pan, "middle", 4);
    for (let step=1;step<=5;step++) {
      await mouse("mouseMoved", {x:pan.x+step*8,y:pan.y+step*4}, "middle", 4);
      await wait(40);
      const during = await state();
      assert.equal(during.mirror, String(during.live));
      assert.equal(during.snapshot, false);
      if (during.live) assert.equal(during.snapshotDisplay, "none");
      assert.ok(Math.abs(during.width-before.width)<1,JSON.stringify({before,during}));
    }
    await mouse("mouseReleased", {x:pan.x+40,y:pan.y+20}, "middle");
    await wait(200);
    assert.equal((await state()).snapshot, true);
    await tap(await point('.miro-canvas-dock__map'));
    await checked(`app.workspace.activeLeaf.view.canvas.zoomToFit();return true;`);
    await wait(250);
    const edge = await checked(`const path=app.workspace.activeLeaf.view.canvas.edges.get('edge').lineGroupEl.querySelector('.canvas-interaction-path');
      const p=path.getPointAtLength(path.getTotalLength()/2),m=path.getScreenCTM();return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};`);
    await tap(edge);
    await wait(800);
    assert.deepEqual(await checked(`return [...app.workspace.activeLeaf.view.canvas.selection].map(n=>n.id);`),['edge']);
    await openMore();
    const edgeState = await state();
    assert.equal(edgeState.mirror,String(edgeState.live));
    assert.ok(edgeState.duplicates.length>0);
    assert.ok(edgeState.duplicates.every(display=>display==='none'));
    console.log(`OK ${theme}: card/edge native menu, duplicate controls, pan preview and stable width`);
  }
  const saved = await checked(`return app.workspace.activeLeaf.view.canvas.getData();`);
  assert.deepEqual(saved.nodes,board.nodes);
  assert.deepEqual(saved.edges,board.edges);
  assert.deepEqual(saved.miroCanvas.connectors,board.miroCanvas.connectors);
  await checked(`await app.plugins.disablePlugin('miro-canvas');return true;`);
  assert.equal(await checked(`return document.querySelectorAll('[data-miro-native-duplicate]').length;`),0);
  await checked(`await app.plugins.enablePlugin('miro-canvas');return true;`);
  await wait(600);
  // The host implementation was inspected before using this popout bridge.
  const oldTargets = (await listTargets(port)).map(t=>t.id);
  await checked(`app.workspace.moveLeafToPopout(app.workspace.activeLeaf);return true;`);
  await wait(700);
  const target = (await listTargets(port)).find(t=>t.type==='page'&&!oldTargets.includes(t.id));
  assert.ok(target,"popout target missing");
  popout = await connectTarget(target);
  connection = popout;
  await connection.send("Page.bringToFront");
  await wait(400);
  assert.equal(await checked(`const p=app.plugins.plugins['miro-canvas'];return p.m1Session.root.ownerDocument.defaultView===window;`),true);
  await tap(await nodePoint());
  const map = await point('.miro-canvas-dock__map');
  await tap(map);
  await mouse("mousePressed",map,"left",1);
  await mouse("mouseMoved",{x:map.x+8,y:map.y+4},"left",1);
  await mouse("mouseReleased",{x:map.x+8,y:map.y+4});
  await wait(250);
  await checked(`app.workspace.activeLeaf.view.canvas.zoomToFit();return true;`);
  await wait(200);
  await tap(await nodePoint());
  await openMore();
  const popoutState = await state();
  assert.equal(popoutState.mirror,String(popoutState.live));
  assert.equal(popoutState.visible,"true");
  writeFileSync(new URL('lint-menu-popout.png',out),await screenshot(connection.send));
  await pressKey(connection.send, 'Escape');
  await tap(await point('.miro-board-connector-hit[data-connector-id="free"]'));
  await openMore();
  assert.equal(await checked(`const slot=document.querySelector('.miro-canvas-toolbar__native');
    const del=slot.querySelector('.miro-canvas-toolbar__button--delete');return !del.hidden&&getComputedStyle(slot).display!=='none';`),true);
  const oldWidth = await checked(`return document.querySelector('.canvas-wrapper').clientWidth;`);
  await checked(`require('@electron/remote').getCurrentWindow().setBounds({x:0,y:0,width:1100,height:850});return true;`);
  await wait(350);
  assert.notEqual(await checked(`return document.querySelector('.canvas-wrapper').clientWidth;`),oldWidth);
  const oldFinger = await checked(`return app.plugins.plugins['miro-canvas'].canvasSettings.fingerDrawing;`);
  await checked(`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({fingerDrawing:true});return true;`);
  await pressKey(connection.send,'Escape');
  await pressKey(connection.send,'p');
  assert.equal(await checked(`return app.plugins.plugins['miro-canvas'].m1Session.armedTool;`),'pen');
  const blank = await checked(`const r=document.querySelector('.canvas-wrapper').getBoundingClientRect();
    const p={x:r.x+100,y:r.y+120};const e=document.elementFromPoint(p.x,p.y);
    if(e?.closest('.miro-canvas-tools,.miro-canvas-dock,.canvas-node'))throw Error('touch point is covered');return p;`);
  async function touch(at = blank) {
    await connection.send("Page.bringToFront");
    await connection.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...at,id:1,radiusX:3,radiusY:3,force:0.5}]});
    await connection.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  const count = () => checked(`return app.workspace.activeLeaf.view.canvas.nodes.size;`);
  const initialCount = await count();
  await touch();
  await wait(100);
  assert.equal(await count(),initialCount,'dot committed before double-tap wait');
  await wait(650);
  assert.equal(await count(),initialCount+1);
  await wait(1500);
  await tap(await point('.miro-canvas-dock button[data-icon="undo-2"]'));
  await wait(250);
  assert.equal(await count(),initialCount,'one undo must remove one dot');
  await tap(await point('.miro-canvas-dock button[data-icon="redo-2"]'));
  assert.equal(await count(),initialCount+1,'one redo must restore one dot');
  await tap(await point('.miro-canvas-dock button[data-icon="undo-2"]'));
  assert.equal(await count(),initialCount);
  await touch();
  await wait(150);
  await touch();
  await wait(750);
  assert.equal(await count(),initialCount,'double-tap must leave no dot');
  await pressKey(connection.send,'p');
  await wait(350);
  await touch();
  await checked(`await app.plugins.disablePlugin('miro-canvas');return true;`);
  await wait(750);
  assert.equal(await count(),initialCount,'unload must cancel delayed dot');
  await checked(`await app.plugins.enablePlugin('miro-canvas');
    await app.plugins.plugins['miro-canvas'].saveCanvasSettings({fingerDrawing:${JSON.stringify(oldFinger)}});return true;`);
  await wait(600);
  await tap(await nodePoint());
  await wait(800);
  await openMore();
  const blurPan = await checked(`const r=document.querySelector('.canvas-wrapper').getBoundingClientRect();return {x:r.x+300,y:r.y+100};`);
  await mouse('mousePressed',blurPan,'middle',4);
  await wait(100);
  assert.equal((await state()).snapshot,false);
  await main.send('Page.bringToFront');
  await wait(200);
  assert.equal((await state()).snapshot,true,'blur must clear the armed snapshot');
  await connection.send('Page.bringToFront');
  await mouse('mouseReleased',blurPan,'middle');
  console.log('OK popout: owner window, minimap click/drag, resize, independent Delete, touch dot/undo/redo, double-tap, pending-dot unload, blur snapshot');
} finally {
  popout?.close();
  main.close();
}
