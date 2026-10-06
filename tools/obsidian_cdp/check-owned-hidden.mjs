// Owned hidden states in installed Obsidian. Windows input stays in the hidden
// renderer; Android pin/menu/close presses use ADB. Prepared selections, review
// state and the exhaustive hidden-attribute probe are explicitly synthetic.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { connectByTitle, evaluate } from './cdp.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const serial = option('--serial');
const port = Number(option('--port', '9346'));
const label = option('--label', 'current');
assert.match(label, /^[a-z0-9-]+$/u);
const run = promisify(execFile);
const adb = process.env.ADB ?? 'C:/Program Files/VirtualTablet Server/adb/adb.exe';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const roots = '.miro-canvas-toolbar,.miro-canvas-handles,.miro-canvas-thread';
const out = new URL('./.out/', import.meta.url);
mkdirSync(out, { recursive: true });
if (serial) {
    await run(adb, ['-s', serial, 'shell', 'input keyevent KEYCODE_WAKEUP'], { windowsHide: true, timeout: 12000 });
    await run(adb, ['-s', serial, 'shell', 'am start -n md.obsidian/md.obsidian.MainActivity'], { windowsHide: true, timeout: 12000 });
}
const { send, close } = await connectByTitle(port, serial ? 'Obsidian' : undefined);
async function checked(code) {
    let timer;
    try {
        const value = await Promise.race([
            evaluate(send, `const base=app.vault.adapter.getBasePath?.().split(String.fromCharCode(92)).join('/');
                if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!base?.includes('/tools/obsidian_cdp/.out/'))throw Error('test vault required');` + code),
            new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Obsidian suspended')), 15000); }),
        ]);
        if (value?.error) throw Error(value.error);
        return value;
    } finally {
        clearTimeout(timer);
    }
}
async function point(selector) {
    return checked(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width>0);
        if(!e)throw Error('missing visible control '+${JSON.stringify(selector)});
        const r=e.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};
        if(!e.contains(document.elementFromPoint(p.x,p.y)))throw Error('obscured control '+${JSON.stringify(selector)});
        return p;`);
}
async function tap(p) {
    if (serial) {
        const focus = await run(adb, ['-s', serial, 'shell', 'dumpsys window'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 12000 });
        assert.ok(focus.stdout.split('\n').find(line => line.includes('mCurrentFocus='))?.includes('md.obsidian/'), 'Android app obscured');
        const dpr = await checked('return devicePixelRatio;');
        await run(adb, ['-s', serial, 'shell', `input tap ${Math.round(p.x * dpr)} ${Math.round(p.y * dpr)}`], { windowsHide: true, timeout: 12000 });
    } else {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1 });
    }
    await wait(450);
}
async function blank() {
    return checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,r=s.root.getBoundingClientRect();
        for(const [u,v] of [[.15,.85],[.85,.7],[.15,.3],[.5,.8],[.5,.45]]){
            const p={x:r.left+u*r.width,y:r.top+v*r.height},e=document.elementFromPoint(p.x,p.y);
            if(e&&s.root.contains(e)&&!e.closest('.canvas-node,.canvas-menu,.canvas-selection,.miro-canvas-mixed-selection-frame,.miro-canvas-tools,.miro-canvas-toolbar,.miro-canvas-thread,.miro-canvas-comment-marker,.miro-canvas-handle,.miro-canvas-resizer,.miro-canvas-dock,.miro-canvas-handles__frame'))return p;
        }throw Error('no unobscured blank board point');`);
}
async function select(ids) {
    await checked(`const c=app.workspace.activeLeaf.view.canvas,s=app.plugins.plugins['miro-canvas'].m1Session;
        c.deselectAll();for(const id of ${JSON.stringify(ids)})c.select(c.nodes.get(id)??c.edges.get(id));s.refresh();return true;`);
    await wait(450);
}
async function hiddenState(stage, exhaustive = false) {
    const state = await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,rs=[...s.root.querySelectorAll(${JSON.stringify(roots)})];
        const describe=e=>({tag:e.tagName,classes:typeof e.className==='string'?e.className:e.getAttribute('class'),display:getComputedStyle(e).display});
        const hidden=[...new Set(rs.flatMap(r=>[r,...r.querySelectorAll('[hidden]')]))].filter(e=>e.hasAttribute('hidden'));
        const failures=hidden.filter(e=>getComputedStyle(e).display!=='none'||e.getClientRects().length>0).map(describe);
        let count=0;const forced=[];
        if(${exhaustive})for(const r of rs)for(const e of [r,...r.querySelectorAll('*')]){
            const attribute=e.getAttribute('hidden');
            try{
                e.setAttribute('hidden','');count++;
                if(getComputedStyle(e).display!=='none'||e.getClientRects().length>0)forced.push(describe(e));
                const active=document.activeElement;
                if(active!==e&&typeof e.focus==='function'){e.focus({preventScroll:true});if(document.activeElement===e)forced.push({...describe(e),focus:true});}
            }finally{if(attribute===null)e.removeAttribute('hidden');else e.setAttribute('hidden',attribute);}
        }
        return {stage:${JSON.stringify(stage)},hidden:hidden.length,forced:count,failures,forcedFailures:forced,
            roots:rs.map(e=>({...describe(e),hidden:e.hidden,rects:e.getClientRects().length}))};`);
    assert.deepEqual(state.failures, [], `${stage}: hidden display/hit area`);
    assert.deepEqual(state.forcedFailures, [], `${stage}: exhaustive hidden display/focus`);
    result.states.push(state);
    return state;
}
async function rootHidden(selector) {
    assert.equal(await checked(`const e=document.querySelector(${JSON.stringify(selector)});return !!e?.hidden&&getComputedStyle(e).display==='none'&&e.getClientRects().length===0;`), true, selector);
}

let saved;
let fixturePath;
const result = { device: serial ?? 'Windows', input: serial ? 'ADB taps; DOM preparation/probe' : 'background CDP renderer synthesis', states: [], passed: false };
try {
    if (!serial) await checked(`const w=require('@electron/remote').getCurrentWindow();w.webContents.setBackgroundThrottling(false);w.hide();return true;`);
    for (let attempt = 0; attempt < 15; attempt++) {
        if (await checked(`return !!app.plugins.plugins['miro-canvas']?.m1Session?.root&&app.workspace.getActiveFile()?.extension==='canvas';`)) break;
        await wait(250);
    }
    saved = await checked(`const f=app.workspace.getActiveFile(),c=app.workspace.activeLeaf.view.canvas;return {file:f.path,text:await app.vault.read(f),theme:app.vault.getConfig('theme'),viewport:{tx:c.tx,ty:c.ty,zoom:c.tZoom}};`);
    fixturePath = `Owned hidden ${serial ?? 'Windows'} ${Date.now()}.canvas`;
    const thread = (id, x, y, locked = false) => ({ id, text: id, createdAt: '2026-10-06T12:00:00Z', author: { name: 'Tester' }, resolved: false, locked, anchor: { type: 'free', x, y }, replies: [], future: { keep: true } });
    const board = {
        nodes: [{ id: 'a', type: 'text', text: 'First', x: 0, y: 0, width: 220, height: 140 }, { id: 'b', type: 'text', text: 'Second', x: 420, y: 0, width: 220, height: 140 }, { id: 'locked', type: 'text', text: 'Locked', x: 0, y: 240, width: 220, height: 140 }],
        edges: [{ id: 'edge', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left' }],
        miroCanvas: { schemaVersion: 1, localOverrides: { locked: { locked: true, future: true } }, localComments: [thread('local', 420, 240), thread('locked-comment', 640, 380, true)] },
        miroSource: { items: [], comments: [thread('imported', 420, 480)], future: { keep: true } }, future: { keep: true },
    };
    await checked(`app.plugins.plugins['miro-canvas'].m1Session.resetTools();const f=await app.vault.create(${JSON.stringify(fixturePath)},${JSON.stringify(JSON.stringify(board))});await app.workspace.getLeaf(false).openFile(f,{active:true});return true;`);
    await wait(1000);
    await checked(`app.workspace.activeLeaf.view.canvas.zoomToFit();return true;`);
    await wait(600);
    for (const theme of ['obsidian', 'moonstone']) {
        await checked(`app.changeTheme(${JSON.stringify(theme)});app.updateTheme();return true;`);
        await wait(250);
        await select([]);
        await rootHidden('.miro-canvas-toolbar');
        await rootHidden('.miro-canvas-handles');
        for (const ids of [['a'], ['edge'], ['a', 'b'], ['locked']]) {
            await select(ids);
            await hiddenState(`${theme}: selection ${ids.join(',')}`, ids.length === 1);
            if (ids[0] === 'a' && ids.length === 1) {
                for (const selector of ['.miro-canvas-toolbar__button--font', '.miro-canvas-toolbar__button--more']) {
                    await tap(await point(selector));
                    assert.equal(await checked(`return document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-expanded');`), 'true');
                    await hiddenState(`${theme}: open ${selector}`);
                    await tap(await point(selector));
                    assert.equal(await checked(`return document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-expanded');`), 'false');
                }
                await tap(await point('.miro-canvas-toolbar__button--more'));
                await tap(await blank());
                await rootHidden('.miro-canvas-toolbar');
                await hiddenState(`${theme}: deselect closes popovers`);
            }
        }
        await checked(`app.plugins.plugins['miro-canvas'].m1Session.toggleReviewMode();return true;`);
        await select(['a']);
        await hiddenState(`${theme}: review handles`);
        assert.equal(await checked(`return [...document.querySelectorAll('.miro-canvas-handles .miro-canvas-handle,.miro-canvas-handles .miro-canvas-resizer')].every(e=>getComputedStyle(e).display==='none');`), true);
        await checked(`const c=app.workspace.activeLeaf.view.canvas;c.undo();app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;`);
        await select([]);
        for (const id of ['local', 'imported', 'locked-comment']) {
            const pin = `.miro-canvas-comment-marker[data-comment-id="${id}"]`;
            await tap(await point(pin));
            assert.equal(await checked(`return document.querySelector('.miro-canvas-thread')?.hidden;`), false);
            await hiddenState(`${theme}: ${id} thread`, true);
            assert.equal(await checked(`const e=document.querySelector('.miro-canvas-thread__composer');return e.hidden&&getComputedStyle(e).display==='none';`), id !== 'local');
            for (const expanded of ['true', 'false']) {
                await tap(await point('.miro-canvas-thread__help-button'));
                assert.equal(await checked(`return document.querySelector('.miro-canvas-thread__help-button').getAttribute('aria-expanded');`), expanded);
                await hiddenState(`${theme}: ${id} help ${expanded}`);
            }
            await tap(await point('.miro-canvas-thread__header button:has(> .lucide-x)'));
            await rootHidden('.miro-canvas-thread');
            await tap(await point(pin));
            assert.equal(await checked(`return document.querySelector('.miro-canvas-thread').hidden;`), false);
            await tap(await blank());
            await rootHidden('.miro-canvas-thread');
        }
        // Compose is prepared, never posted; closing uses renderer/ADB input.
        await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,p=s.viewportPoint({x:300,y:240});s.composeComment({x:300,y:240},p);return true;`);
        await hiddenState(`${theme}: new comment compose`, true);
        assert.equal(await checked(`return [...document.querySelectorAll('.miro-canvas-thread__resolve,.miro-canvas-thread__help-button,.miro-canvas-thread__messages')].every(e=>e.hidden&&getComputedStyle(e).display==='none');`), true);
        await tap(await point('.miro-canvas-thread__header button:has(> .lucide-x)'));
        await rootHidden('.miro-canvas-thread');
        if (serial && await checked(`return app.plugins.plugins['miro-canvas'].m1Session.root.getAttribute('data-miro-canvas-keyboard')==='open';`)) {
            await run(adb, ['-s', serial, 'shell', 'input keyevent KEYCODE_BACK'], { windowsHide: true, timeout: 12000 });
            await wait(450);
            assert.equal(await checked(`return app.workspace.getActiveFile().path;`), fixturePath, 'keyboard dismissal must stay on fixture');
        }
        assert.deepEqual(await checked('return app.workspace.activeLeaf.view.canvas.getData();'), board, 'read-only interactions/undone review preserve fixture');
        console.log(`OK ${serial ?? 'Windows'} ${theme}: owned hidden roots, controls, popovers and comment lifecycle`);
    }
    await checked(`await app.plugins.disablePlugin('miro-canvas');await app.plugins.enablePlugin('miro-canvas');return true;`);
    await wait(1000);
    await select([]);
    await rootHidden('.miro-canvas-toolbar');
    await rootHidden('.miro-canvas-handles');
    await hiddenState('plugin reload', true);
    assert.deepEqual(await checked('return app.workspace.activeLeaf.view.canvas.getData();'), board);
    result.passed = true;
} finally {
    if (saved) {
        await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;s?.resetTools();s?.closeCommentThread();app.changeTheme(${JSON.stringify(saved.theme)});app.updateTheme();await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(saved.file)}),{active:true});return true;`);
        await wait(700);
        await checked(`app.workspace.activeLeaf.view.canvas.setViewport(${saved.viewport.tx},${saved.viewport.ty},${saved.viewport.zoom});return true;`);
        const restored = await checked(`return await app.vault.read(app.workspace.getActiveFile());`);
        assert.deepEqual(JSON.parse(restored), JSON.parse(saved.text), 'original document unchanged');
    }
    writeFileSync(new URL(`hidden-${serial ?? 'Windows'}-${label}.json`, out), JSON.stringify(result, null, 2));
    if (!serial) assert.equal(await checked(`return require('@electron/remote').getCurrentWindow().isVisible();`), false);
    close();
}
