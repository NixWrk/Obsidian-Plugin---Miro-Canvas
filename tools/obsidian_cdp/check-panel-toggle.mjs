// Real Obsidian regression check. Run only against your own isolated instance.
import assert from 'node:assert/strict';
import {connectByTitle, evaluate} from './cdp.mjs';
const port = Number(process.argv[2] ?? 9336);
const {send, close} = await connectByTitle(port);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function checked(code) {
  const value = await evaluate(send, code);
  if (value?.error) throw Error(value.error);
  return value;
}
async function measure() {
  return checked(`const p=document.querySelector('.miro-canvas-tools');
    const b=p.querySelector('.miro-canvas-panel-toggle');const r=b.getBoundingClientRect();
    const s=getComputedStyle(b);return {x:r.x,y:r.y,width:r.width,height:r.height,
    background:s.backgroundColor,collapsed:p.getAttribute('data-miro-canvas-panel-collapsed')};`);
}
async function press(point, type, buttons) {
  await send('Input.dispatchMouseEvent', {type, button:'left', buttons, clickCount:1, x:point.x+22, y:point.y+22});
}
async function click() {
  const point = await measure();
  await press(point, 'mousePressed', 1);
  await press(point, 'mouseReleased', 0);
  await wait(100);
}
const saved = await checked(`return {layout:app.plugins.plugins['miro-canvas'].canvasSettings.panelLayout,
  mobile:document.body.classList.contains('is-mobile'),tablet:document.body.classList.contains('is-tablet')};`);
try {
  await checked("document.body.classList.add('is-mobile','is-tablet');return true;");
  for (const orientation of ['horizontal','vertical']) {
    for (const anchor of ['top-left','top-right','bottom-left','bottom-right']) {
      if (process.env.PANEL_CASE && process.env.PANEL_CASE !== `${orientation} ${anchor}`) continue;
      await checked(`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({panelLayout:{toolbar:{anchor:${JSON.stringify(anchor)},dx:80,dy:80,orientation:${JSON.stringify(orientation)}}}});return true;`);
      await wait(600);
      let pivot = await measure();
      for (let cycle = 0; cycle < 12; cycle++) {
        await click();
        const next = await measure();
        assert.ok(Math.hypot(next.x-pivot.x,next.y-pivot.y)<=1, `${orientation} ${anchor}: toggle drift ${JSON.stringify({pivot,next})}`);
        assert.equal(next.background, 'rgba(0, 0, 0, 0)', 'sticky hover background');
        assert.equal(next.width,44);
        assert.equal(next.height,44);
      }
      await click();
      pivot = await measure();
      await press(pivot,'mousePressed',1);
      await wait(500);
      const moved = {x:pivot.x+(anchor.includes('right')?-160:160),y:pivot.y+(anchor.includes('bottom')?-100:100)};
      await press(moved,'mouseMoved',1);
      await press(moved,'mouseReleased',0);
      await wait(150);
      const dropped = await measure();
      assert.ok(Math.hypot(dropped.x-moved.x,dropped.y-moved.y)<=1,`held drag drift: ${JSON.stringify({pivot,moved,dropped})}`);
      for(let cycle=0;cycle<8;cycle++) {
        await click();
        const next=await measure();
        assert.ok(Math.hypot(next.x-dropped.x,next.y-dropped.y)<=1,`${orientation} ${anchor}: drift after dragging`);
      }
      await click();
      const open = await measure();
      await press(open,'mousePressed',1);
      await wait(500);
      const movedOpen = {x:open.x+(anchor.includes('right')?80:-80),y:open.y+(anchor.includes('bottom')?60:-60)};
      await press(movedOpen,'mouseMoved',1);
      await press(movedOpen,'mouseReleased',0);
      await wait(150);
      const openDrop=await measure();
      assert.ok(Math.hypot(openDrop.x-movedOpen.x,openDrop.y-movedOpen.y)<=1,'open held drag drift');
      for(let cycle=0;cycle<7;cycle++) {
        await click();
        const next=await measure();
        assert.ok(Math.hypot(next.x-openDrop.x,next.y-openDrop.y)<=1,'drift after open drag');
      }
      console.log(`OK ${orientation} ${anchor}: 28 toggles, open and folded held drags`);
    }
  }
} finally {
  await checked(`document.body.classList.toggle('is-mobile',${saved.mobile});document.body.classList.toggle('is-tablet',${saved.tablet});await app.plugins.plugins['miro-canvas'].saveCanvasSettings({panelLayout:${JSON.stringify(saved.layout)}});return true;`);
  close();
}
