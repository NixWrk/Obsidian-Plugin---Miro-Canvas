// Held pressure strokes and smart shape regressions in installed Android Obsidian.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { connectByTitle, evaluate } from "./cdp.mjs";

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
assert.ok(args.includes("--serial") && args.includes("--port"));
const serial = option("--serial");
const { send, close } = await connectByTitle(Number(option("--port")), "Obsidian");
const run = promisify(execFile);
const adb = process.env.ADB ?? "C:/Program Files/VirtualTablet Server/adb/adb.exe";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const out = new URL("./.out/", import.meta.url);
mkdirSync(out, { recursive: true });
const results = [];
const resultSuffix = ["hold-only", "shapes-only", "pressure-only"].find(mode => args.includes("--" + mode));
let saved;
async function checked(code) {
  const value = await evaluate(send, `if(app.vault.getName()!=='MiroCanvasTest')throw Error('test vault required');${code}`);
  if (value?.error) throw Error(value.error);
  return value;
}
async function shell(command) {
  return run(adb, ["-s", serial, "shell", command], { windowsHide: true, timeout: 20000 });
}
async function state() {
  return checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=app.workspace.activeLeaf.view.canvas;
    const line=s.root.querySelector('.miro-canvas-tool-ghost__line');return {points:s.penPoints,pressures:s.penPressures,path:line?.getAttribute('d'),bounds:line?.getBoundingClientRect().toJSON(),
      nodes:c.nodes.size,history:c.history.current,camera:{live:s.viewport.getViewport(),zoom:c.zoom,tZoom:c.tZoom},data:c.getData()};`);
}
async function prepare(tool, hold = true, zoom = 0) {
  await checked(`const p=app.plugins.plugins['miro-canvas'];p.m1Session.resetTools();
    await p.saveCanvasSettings({holdStraightLine:${hold},penPressure:true,fingerDrawing:true});
    const f=await app.vault.create(${JSON.stringify(`Drawing regression ${serial} `)}+Date.now()+'.canvas',JSON.stringify({nodes:[],edges:[]}));
    await app.workspace.getLeaf(false).openFile(f,{active:true});return true;`);
  await wait(450);
  return checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=app.workspace.activeLeaf.view.canvas;
    c.setViewport(0,0,${zoom});s.armTool(${JSON.stringify(tool)});
    const r=s.root.getBoundingClientRect();return {x:r.x+r.width*.35,y:r.y+r.height*.65,dpr:devicePixelRatio};`);
}
async function gesture(points, hold = 0, previewCheck, cancel = false) {
  const dpr = await checked('return devicePixelRatio;');
  const at = p => `${Math.round(p.x*dpr)} ${Math.round(p.y*dpr)}`;
  const commands = [`input stylus motionevent DOWN ${at(points[0])}`];
  for (const p of points.slice(1)) commands.push('sleep 0.04', `input stylus motionevent MOVE ${at(p)}`);
  await shell(commands.join('; '));
  const moving = await state();
  assert.ok(moving.points.length > 2, 'actual pen movement must reach the preview');
  assert.equal(moving.nodes, 0);
  const before = moving.history;
  if (hold) await wait(hold);
  const preview = await state();
  assert.equal(preview.nodes, 0, 'preview must stay unsaved');
  assert.equal(preview.history, before);
  if (previewCheck) previewCheck(preview);
  if (hold && preview.points.length === 2 && !cancel) {
    const endpoint = {x:points.at(-1).x+12,y:points.at(-1).y+20};
    await shell(`input stylus motionevent MOVE ${at(endpoint)}`);
    await wait(180);
    const following = await state();
    assert.equal(following.points.length,2,'held line keeps following the endpoint');
    assert.notDeepEqual(following.points[1],preview.points[1]);
  }
  await shell(`input stylus motionevent ${cancel ? 'CANCEL' : 'UP'} ${at(points.at(-1))}`);
  await wait(300);
  const committed = await state();
  assert.equal(committed.nodes, cancel ? 0 : 1);
  assert.equal(committed.history, before + (cancel ? 0 : 1));
  return { preview, committed };
}
async function historyTap(icon) {
  const p = await checked(`const e=document.querySelector('.miro-canvas-dock [data-icon="${icon}"]'),r=e.getBoundingClientRect();
    return {x:Math.round((r.x+r.width/2)*devicePixelRatio),y:Math.round((r.y+r.height/2)*devicePixelRatio)};`);
  await shell(`input touchscreen tap ${p.x} ${p.y}`);
  await wait(250);
}
try {
  await shell('input stylus motionevent CANCEL 0 0');
  saved = await checked(`const f=app.workspace.getActiveFile(),c=app.workspace.activeLeaf.view.canvas;return {
    file:f.path,text:await app.vault.read(f),settings:app.plugins.plugins['miro-canvas'].canvasSettings,
    viewport:{tx:c.tx,ty:c.ty,zoom:c.tZoom}};`);
  writeFileSync(new URL(`drawing-before-${serial}.json`, out), JSON.stringify(saved));
  for (const [tool, hold, zoom, cancel] of ((args.includes('--shapes-only') || args.includes('--pressure-only')) ? [] : [['pen',true,0,false],['pen',true,-1,false],['highlighter',true,0,false],['pen',false,0,false],['pen',true,0,true]])) {
    const p = await prepare(tool, hold, zoom);
    const points = [[0,0],[20,15],[40,-10],[60,18],[90,0]].map(([x,y])=>({x:p.x+x,y:p.y+y}));
    const result = await gesture(points, 750, preview => {
      assert.equal(preview.points.length === 2, hold, 'hold setting controls straightening');
      if (tool === 'pen') assert.ok(preview.path?.startsWith('M'), 'pressure preview uses a filled path');
    }, cancel);
    if (!cancel) {
      const item = Object.values(result.committed.data.miroCanvas.localOverrides)[0].item;
      assert.equal(item.stroke.points.length === 4, hold);
      await historyTap('undo-2');
      assert.equal((await state()).nodes, 0);
      await historyTap('redo-2');
      assert.equal((await state()).nodes, 1);
    }
    results.push({tool,hold,zoom,cancel,previewPoints:result.preview.points.length});
    console.log('OK hold', serial, JSON.stringify(results.at(-1)));
  }
  if (!args.includes('--shapes-only') && !args.includes('--hold-only')) {
    for (const pressureZoom of [0,-1,1]) {
    const p = await prepare('pen',true,pressureZoom);
    const input = async (type,x,y,force) => {
      const response=await send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,pointerType:'pen',force});
      if(response.error)throw Error(response.error.message);
    };
    await input('mousePressed',p.x,p.y,0.2);
    for(const [x,y,force] of [[25,20,0.4],[50,-15,0.8],[75,0,0.3]])await input('mouseMoved',p.x+x,p.y+y,force);
    const moving=await state();
    assert.ok(moving.pressures.length>2 && new Set(moving.pressures).size>1,'controlled pressure samples must differ');
    await wait(200);
    await input('mouseMoved',p.x+77,p.y+1,0.95);
    const still=await state();
    assert.equal(still.pressures.at(-1),moving.pressures.at(-1),'stationary jitter must not thicken the waiting stroke');
    await wait(450);
    const held=await state();
    assert.equal(held.points.length,2);
    assert.ok(held.path?.startsWith('M'));
    assert.equal(held.nodes,0);
    for(const force of [0.95,0.05,0,0.5]) {
      await input('mouseMoved',p.x+77,p.y+1,force);
      assert.equal((await state()).path,held.path,'held outline must not breathe with stationary force');
    }
    await input('mouseMoved',p.x+95,p.y+30,0.9);
    assert.equal((await state()).points.length,2);
    const beforeLift=await state();
    await input('mouseMoved',p.x+95,p.y+30,0);
    assert.equal((await state()).path,beforeLift.path,'zero-pressure move before lift must preserve outline');
    await input('mouseReleased',p.x+95,p.y+30,0);
    await wait(250);
    const committed=await state();
    const stroke=Object.values(committed.data.miroCanvas.localOverrides)[0].item.stroke;
    assert.equal(stroke.points.length,4);
    assert.equal(stroke.widths.length,2);
    assert.deepEqual(stroke.widths,beforeLift.pressures.map(scale=>Math.round(scale*5*100)/100));
    assert.notEqual(stroke.widths[0],stroke.widths[1]);
    assert.equal(committed.history,moving.history+1);
    const rendered=await checked(`const c=app.workspace.activeLeaf.view.canvas,n=c.nodes.values().next().value;
      const path=[...n.nodeEl.querySelectorAll('svg path')].find(e=>e.getAttribute('stroke')==='none' && e.getAttribute('d')?.includes('a'));
      if(!path)throw Error('saved pressure outline missing');return path.getBoundingClientRect().toJSON();`);
    // Native Canvas rounds node position/dimensions to board units on creation.
    const roundingTolerance=0.7*beforeLift.camera.live.zoom;
    for(const key of ['x','y','width','height'])assert.ok(Math.abs(rendered[key]-beforeLift.bounds[key])<roundingTolerance,'saved outline must match held preview within native rounding: '+key);
    await historyTap('undo-2');assert.equal((await state()).nodes,0);
    await historyTap('redo-2');assert.deepEqual((await state()).data,committed.data);
    results.push({stableHoldPressure:true,zoom:pressureZoom,previewBounds:beforeLift.bounds,savedBounds:rendered});
    results.push({controlledCdpPressure:true,widths:stroke.widths});
    console.log('OK controlled CDP pressure',serial,pressureZoom,JSON.stringify(stroke.widths));
    }
  }
  if (!args.includes('--hold-only') && !args.includes('--pressure-only')) {
    const rectangle = [[0,0],[50,4],[100,0],[103,35],[100,65],[45,67],[0,65],[-2,30],[0,0]];
    const oval = Array.from({length:25},(_,i)=>[50+50*Math.cos(i*Math.PI/12),32+32*Math.sin(i*Math.PI/12)]);
    const triangle = [[0,65],[25,32],[50,0],[75,32],[100,65],[50,65],[0,65]];
    for (const [kind, shape, angle] of [['rectangle',rectangle,0],['rectangle',rectangle,8],['rectangle',rectangle,30],['rectangle',rectangle,-30],['rectangle',rectangle,60],['rectangle',rectangle,80],['ellipse',oval,0],['ellipse',oval,30],['triangle',triangle,0],['triangle',triangle,30]]) {
      const p = await prepare('smart');
      const a = angle*Math.PI/180;
      const points = shape.map(([x,y])=>({x:p.x+x*Math.cos(a)-y*Math.sin(a),y:p.y+x*Math.sin(a)+y*Math.cos(a)}));
      const {committed} = await gesture(points);
      const override = Object.values(committed.data.miroCanvas.localOverrides)[0];
      const actual = override.shape.kind;
      const rotation = override.rotation ?? 0;
      const expectedRotation = Math.round(angle/45)*45;
      assert.equal(rotation,expectedRotation);
      const node = committed.data.nodes[0];
      if(kind==='rectangle') {
        assert.ok(node.width>90 && node.width<115,'local width must not grow into the rotated bounding box');
        assert.ok(node.height>60 && node.height<80);
      }
      const rendered = await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;
        return [...s.root.querySelectorAll('[data-miro-source-owned-rotation]')].map(e=>({rotation:Number(e.getAttribute('data-miro-source-owned-rotation')),transform:e.style.transform}));`);
      if(rotation!==0) assert.ok(rendered.some(e=>e.rotation===rotation && e.transform.includes('rotate(')),'real node must render its saved rotation');
      results.push({expected:kind,actual,angle,rotation,width:node.width,height:node.height});
      console.log('SHAPE', serial, JSON.stringify(results.at(-1)));
      assert.equal(actual,kind);
      const selectionPoint = await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;s.resetTools();
        const n=app.workspace.activeLeaf.view.canvas.getData().nodes[0],p=s.viewportPoint({x:n.x+n.width/2,y:n.y+n.height/2});
        return {x:Math.round(p.x*devicePixelRatio),y:Math.round(p.y*devicePixelRatio)};`);
      await shell(`input touchscreen tap ${selectionPoint.x} ${selectionPoint.y}`);
      await wait(900);
      const selected = await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;
        return {ids:[...app.workspace.activeLeaf.view.canvas.selection].map(n=>n.id),rotation:s.handlesState(true).rotation};`);
      assert.deepEqual(selected.ids,[node.id]);
      assert.equal(selected.rotation,rotation,'selection keeps the drawn orientation');
      if(kind==='rectangle' && angle===30) {
        const shot=await run(adb,['-s',serial,'exec-out','screencap','-p'],{encoding:'buffer',maxBuffer:20*1024*1024,windowsHide:true,timeout:10000});
        writeFileSync(new URL(`drawing-rotation-${serial}.png`,out),shot.stdout);
      }
      await historyTap('undo-2');
      assert.equal((await state()).nodes,0);
      await historyTap('redo-2');
      const redone=await state();
      assert.equal(redone.nodes,1);
      assert.deepEqual(redone.data,committed.data,'Redo restores shape, geometry and rotation together');
    }
  }
} finally {
  await shell('input stylus motionevent CANCEL 0 0');
  writeFileSync(new URL(`drawing-results-${serial}${resultSuffix ? "-" + resultSuffix : ""}.json`, out), JSON.stringify(results,null,2));
  if (saved) await checked(`const p=app.plugins.plugins['miro-canvas'];p.m1Session.resetTools();await p.saveCanvasSettings(${JSON.stringify(saved.settings)});
    await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(saved.file)}),{active:true});
    await new Promise(resolve=>setTimeout(resolve,500));
    const c=app.workspace.activeLeaf.view.canvas;c.setViewport(${saved.viewport.tx},${saved.viewport.ty},${saved.viewport.zoom});
    if(app.workspace.getActiveFile()?.path!==${JSON.stringify(saved.file)})throw Error('original board not reopened');return true;`);
  close();
}
