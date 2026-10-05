// Real touch input in the explicitly authorized Android test vault.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connectByTitle, evaluate } from "./cdp.mjs";

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const serial = args.includes("--serial") ? option("--serial") : undefined;
if (!serial) throw Error("Usage: --serial <Android device> [--port 9340]");
const port = Number(args.includes("--port") ? option("--port") : 9340);
const { send, close } = await connectByTitle(port, "Obsidian");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = promisify(execFile);
const guard = `if(app.vault.getName()!=="MiroCanvasTest")throw Error("wrong vault");`;
async function checked(code) {
  const value = await evaluate(send, guard + code);
  if (value?.error) throw Error(value.error);
  return value;
}
async function tap(selector) {
  const point = await checked(`const b=document.querySelector(${JSON.stringify(selector)});if(!b)throw Error("missing control");
    const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    if(!b.contains(document.elementFromPoint(x,y)))throw Error("covered control: "+${JSON.stringify(selector)});return {x,y};`);
  await run(process.execPath, ["tools/obsidian_cdp/android.mjs", "tap", "--serial", serial, "--port", String(port), "--x", String(point.x), "--y", String(point.y)]);
  await wait(180);
}
async function folded() {
  return checked(`const p=document.querySelector('.miro-canvas-tools'),b=p.querySelector('.miro-canvas-panel-toggle');
    const bar=p.querySelector('[data-miro-panel-toggle-host]'),r=b.getBoundingClientRect(),s=getComputedStyle(bar);
    return {x:r.x+r.width/2,y:r.y+r.height/2,folded:p.getAttribute('data-miro-canvas-panel-collapsed')==='true',
    width:r.width,height:r.height,padding:s.padding,minWidth:s.minWidth,minHeight:s.minHeight,background:getComputedStyle(b).backgroundColor};`);
}
const saved = await checked(`const p=app.plugins.plugins['miro-canvas'];return {panelLayout:p.canvasSettings.panelLayout,hiddenPanelButtons:p.canvasSettings.hiddenPanelButtons??[]};`);
try {
  const exportOpen = await checked(`const b=document.querySelector('.miro-canvas-export__close');return b&&b.getBoundingClientRect().width>0;`);
  if (exportOpen) await tap(".miro-canvas-export__close");
  for (const orientation of ["horizontal", "vertical"]) {
    await checked(`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({hiddenPanelButtons:[],panelLayout:{toolbar:{anchor:'top-left',dx:16,dy:65,orientation:${JSON.stringify(orientation)}}}});return true;`);
    await wait(650);
    const pivot = await folded();
    for (let cycle = 0; cycle < 8; cycle++) {
      await tap(".miro-canvas-tools .miro-canvas-panel-toggle");
      const state = await folded();
      assert.ok(Math.hypot(state.x - pivot.x, state.y - pivot.y) <= 1, JSON.stringify(state));
      assert.equal(state.width, 44);
      assert.equal(state.height, 44);
      assert.equal(state.background, "rgba(0, 0, 0, 0)");
      if (state.folded) {
        assert.equal(state.padding, "0px");
        assert.equal(state.minWidth, "0px");
        assert.equal(state.minHeight, "0px");
      }
    }
    await tap(".miro-canvas-tools__more > button");
    const open = await checked(`const p=document.querySelector('.miro-canvas-tools');return {more:p.getAttribute('data-miro-tools-more-open'),popover:p.getAttribute('data-miro-tools-popover-open'),z:getComputedStyle(p.querySelector('[data-miro-panel-toggle-host]')).zIndex};`);
    assert.deepEqual(open, { more: "true", popover: "true", z: "130" });
    await tap(".miro-canvas-tools__more > button");
    const closed = await checked(`const p=document.querySelector('.miro-canvas-tools');return p.getAttribute('data-miro-tools-more-open');`);
    assert.equal(closed, "false");
    console.log(`OK ${serial} ${orientation}: repeated folds, zero folded spacing, More stacking`);
  }
} finally {
  await checked(`await app.plugins.plugins['miro-canvas'].saveCanvasSettings(${JSON.stringify(saved)});return true;`);
  close();
}
