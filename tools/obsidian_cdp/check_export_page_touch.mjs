import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectByTitle, evaluate } from "./cdp.mjs";

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const serial = option("--serial");
const port = Number(option("--port"));
assert.ok(args.includes("--serial") && args.includes("--port"), "--serial and --port required");
const { send, close } = await connectByTitle(port, "Obsidian");
async function checked(code) {
    const result = await evaluate(send, `if(app.vault.getName() !== 'MiroCanvasTest') throw Error('test vault required'); ${code}`);
    if (result?.error) throw Error(result.error);
    return result;
}
async function state() {
    return checked(`
        const session = app.plugins.plugins['miro-canvas'].m1Session;
        const canvas = app.workspace.activeLeaf.view.canvas;
        const document = session.adapter.getDocument();
        return {page: {...session.exporting.state.pages[0]}, camera: {x:canvas.x, y:canvas.y, zoom:canvas.zoom},
            nodes: JSON.stringify(document.nodes), edges: JSON.stringify(document.edges),
            drag: !!session.exporting.overlay.drag, marquee: !!window.document.querySelector('.miro-canvas-rectangle-marquee')};
    `);
}
async function swipe(selector, dx, dy) {
    const before = await state();
    const point = await checked(`
        const element = document.querySelector(${JSON.stringify(selector)});
        const rect = element.getBoundingClientRect();
        const point = {x:rect.x+rect.width/2, y:rect.y+rect.height/2};
        if(document.elementFromPoint(point.x,point.y) !== element) throw Error('page control obscured');
        return point;
    `);
    const child = spawn(process.execPath, [fileURLToPath(new URL('./android.mjs', import.meta.url)),
        'swipe', '--serial', serial, '--port', String(port), '--x', String(point.x), '--y', String(point.y),
        '--to-x', String(point.x+dx), '--to-y', String(point.y+dy), '--ms', '1200'], { windowsHide: true });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const finished = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(Error(output)));
    });
    await new Promise(resolve => setTimeout(resolve, 650));
    const preview = await state();
    await finished;
    assert.equal(preview.drag, true, 'touch gesture should start');
    assert.equal(preview.marquee, false);
    assert.deepEqual(preview.page, before.page, 'preview must not persist');
    const after = await state();
    assert.equal(after.drag, false, 'touch gesture should finish');
    assert.deepEqual(after.camera, before.camera, 'page gesture must not pan the board');
    assert.equal(after.nodes, before.nodes);
    assert.equal(after.edges, before.edges);
    return {before:before.page, after:after.page};
}
try {
    const device = await checked(`return {width:innerWidth, height:innerHeight, tablet:document.body.classList.contains('is-tablet'), version:app.plugins.plugins['miro-canvas'].manifest.version};`);
    await checked(`
        const canvas = app.workspace.activeLeaf.view.canvas;
        canvas.deselectAll();
        const session = app.plugins.plugins['miro-canvas'].m1Session;
        session.openExport();
        const phone = !document.body.classList.contains('is-tablet');
        const first = session.boardPoint({x:65,y:phone ? 450 : innerHeight*0.64});
        const last = session.boardPoint({x:phone ? 165 : 210,y:phone ? 490 : innerHeight*0.80});
        session.changeExport(state=>({...state,format:'free',pages:[{id:'touch-page-check',name:'Page 1',
            x:first.x,y:first.y,width:last.x-first.x,height:last.y-first.y}]}));
        session.refresh();
        return true;
    `);
    const moved = await swipe('.miro-canvas-export-page__tab', 24, 20);
    assert.ok(moved.after.x > moved.before.x && moved.after.y > moved.before.y);
    assert.ok(Math.abs(moved.after.width-moved.before.width)<0.01);
    assert.ok(Math.abs(moved.after.height-moved.before.height)<0.01);
    const resized = await swipe('.miro-canvas-export-page__corner', 25, 18);
    assert.ok(resized.after.width > resized.before.width && resized.after.height > resized.before.height);
    await checked(`
        const session = app.plugins.plugins['miro-canvas'].m1Session;
        session.exporting.panel.actions.onFormat('a4','portrait');
        if(!document.body.classList.contains('is-tablet')) {
            const first = session.boardPoint({x:65,y:420});
            const last = session.boardPoint({x:125,y:420+60*297/210});
            session.changeExport(state=>({...state,pages:state.pages.map(page=>({...page,x:first.x,y:first.y,width:last.x-first.x,height:last.y-first.y}))}));
        }
        return true;
    `);
    const paper = await swipe('.miro-canvas-export-page__corner', -16, -12);
    assert.ok(Math.abs(paper.after.width/paper.after.height-210/297)<0.002);
    const saved = await checked(`
        const session = app.plugins.plugins['miro-canvas'].m1Session;
        const before = {...session.exporting.state.pages[0]};
        session.closeExport();
        session.openExport();
        return {before, after: session.exporting.state.pages[0]};
    `);
    for (const key of ['x','y','width','height']) assert.ok(Math.abs(saved.before[key]-saved.after[key])<0.01);
    const report = {ok:true,serial,device,moved,resized,paper,persisted:true};
    if (args.includes('--out')) writeFileSync(option('--out'), JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
} finally {
    close();
}
