import assert from 'node:assert/strict';
import { connectByTitle, evaluate } from './cdp.mjs';
const port = Number(process.env.CDP_PORT ?? 9336);
const { send, close } = await connectByTitle(port);
async function checked(code) {
    const result = await evaluate(send, code);
    if (result?.error) {
        throw Error(result.error);
    }
    return result;
}
async function state() { return checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;const d=s.adapter.getDocument();return {page:s.exporting.state.pages[0],nodes:JSON.stringify(d.nodes),edges:JSON.stringify(d.edges),marquee:!!document.querySelector('.miro-canvas-rectangle-marquee'),drag:!!s.exporting.overlay.drag};`); }
async function drag(selector, dx, dy) {
    const before = await state();
    const point = await checked(`const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();const p={x:r.x+r.width/2,y:r.y+r.height/2};if(document.elementFromPoint(p.x,p.y)!==e)throw Error('control is obscured');return p;`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    for (let n = 1; n <= 8; n++)
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + dx * n / 8, y: point.y + dy * n / 8, button: 'left', buttons: 1 });
    const preview = await state();
    assert.equal(preview.drag, true, 'page drag should start');
    assert.equal(preview.marquee, false, 'no board marquee');
    assert.deepEqual(preview.page, before.page, 'preview must not persist');
    assert.equal(preview.nodes, before.nodes);
    assert.equal(preview.edges, before.edges);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + dx, y: point.y + dy, button: 'left', buttons: 0, clickCount: 1 });
    const after = await state();
    assert.equal(after.drag, false);
    assert.equal(after.nodes, before.nodes);
    assert.equal(after.edges, before.edges);
    return { before: before.page, after: after.page };
}
try {
    await checked(`const p=app.vault.adapter.getBasePath().replaceAll('\\\\','/');if(!p.includes('/tools/obsidian_cdp/.out/'))throw Error('isolated vault required');const s=app.plugins.plugins['miro-canvas'].m1Session;s.openExport();s.changeExport(c=>({...c,format:'free',pages:[{id:'mouse-page-check',x:200,y:100,width:400,height:260,name:'Page 1'}]}));s.showRect({x:0,y:0,width:1000,height:800});return true;`);
    const moved = await drag('.miro-canvas-export-page__tab', 60, 40);
    assert.ok(moved.after.x > moved.before.x);
    assert.ok(moved.after.y > moved.before.y);
    assert.equal(moved.after.width, moved.before.width);
    assert.equal(moved.after.height, moved.before.height);
    const resized = await drag('.miro-canvas-export-page__corner', 50, 30);
    assert.equal(resized.after.x, resized.before.x);
    assert.equal(resized.after.y, resized.before.y);
    assert.ok(resized.after.width > resized.before.width);
    assert.ok(resized.after.height > resized.before.height);
    await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;s.exporting.panel.actions.onFormat('a4','portrait');return true;`);
    const paper = await drag('.miro-canvas-export-page__corner', -40, -25);
    assert.ok(Math.abs(paper.after.width / paper.after.height - 210 / 297) < 0.002);
    const saved = await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;const p=s.exporting.state.pages[0];s.closeExport();s.openExport();return {before:p,after:s.exporting.state.pages[0],zoom:app.workspace.activeLeaf.view.canvas.zoom};`);
    assert.equal(saved.before.id, saved.after.id);
    for (const key of ["x", "y", "width", "height"])
        assert.ok(Math.abs(saved.before[key] - saved.after[key]) < 0.01, `persisted ${key}`);
    console.log(JSON.stringify({ ok: true, moved, resized, paper, persisted: true, zoom: saved.zoom }));
}
finally {
    close();
}
