// Native selection/attachment/Markdown state in isolated desktop or Android Obsidian.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
import { connectByTitle, evaluate, screenshot } from './cdp.mjs';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option('--port', '9346'));
const serial = option('--serial');
const { send, close } = await connectByTitle(port, serial ? 'Obsidian' : undefined);
const run = promisify(execFile);
const adb = process.env.ADB ?? 'C:/Program Files/VirtualTablet Server/adb/adb.exe';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const out = new URL('./.out/', import.meta.url);
mkdirSync(out, { recursive: true });
const results = [];
let saved;
async function checked(code) {
    const value = await evaluate(send, `${serial ? "if(app.vault.getName()!=='MiroCanvasTest')throw Error('test vault required');" : "if(!app.vault.adapter.basePath?.replaceAll('\\\\','/').includes('/tools/obsidian_cdp/.out/'))throw Error('isolated vault required');"}${code}`);
    if (value?.error)
        throw Error(value.error);
    return value;
}
async function point(id) {
    return checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,n=app.workspace.activeLeaf.view.canvas.nodes.get(${JSON.stringify(id)}).getData();return s.viewportPoint({x:n.x+n.width/2,y:n.y+n.height/2});`);
}
async function input(type, p) {
    if (serial) {
        if(type==='down'){const focus=await run(adb,['-s',serial,'shell','dumpsys window'],{windowsHide:true,maxBuffer:8*1024*1024,timeout:12000});const current=focus.stdout.split('\n').find(line=>line.includes('mCurrentFocus='));if(!current?.includes('md.obsidian/'))throw Error('Android Obsidian is obscured by a system/other app window; no input sent');}
        const dpr = await checked('return devicePixelRatio;');
        await run(adb, ['-s', serial, 'shell', `input touchscreen motionevent ${type === 'down' ? 'DOWN' : type === 'up' ? 'UP' : type === 'cancel' ? 'CANCEL' : 'MOVE'} ${Math.round(p.x * dpr)} ${Math.round(p.y * dpr)}`], { windowsHide: true, timeout: 12000 });
    }
    else {
        const r = await send('Input.dispatchMouseEvent', { type: type === 'down' ? 'mousePressed' : type === 'up' ? 'mouseReleased' : 'mouseMoved', ...p, button: 'left', buttons: type === 'up' ? 0 : 1, clickCount: 1 });
        if (r.error)
            throw Error(r.error.message);
    }
}
async function tap(p) {
    await input('down', p);
    await input('up', p);
    await wait(1000);
}
async function selection() {
    return checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=app.workspace.activeLeaf.view.canvas,f=s.root.querySelector('.miro-canvas-handles__frame'),native=[...s.root.querySelectorAll('.canvas-selection')];return {
 ids:[...c.selection].map(n=>n.id),outline:f?getComputedStyle(f).outlineStyle:null,turned:f?.getAttribute('data-miro-canvas-turned'),
 native:native.map(e=>({parent:e.parentElement.className,parentIsCanvas:e.parentElement===c.canvasEl,parentIsRoot:e.parentElement===s.root})),
 mark:f?.getAttribute('data-miro-native-outline'),history:c.history.current,data:c.getData()};`);
}
try {
    if(serial){await run(adb,['-s',serial,'shell','input keyevent KEYCODE_WAKEUP'],{windowsHide:true,timeout:12000});await run(adb,['-s',serial,'shell','am start -n md.obsidian/md.obsidian.MainActivity'],{windowsHide:true,timeout:12000});await wait(500);}
    if (serial && await checked(`return app.plugins.plugins['miro-canvas'].m1Session.root.getAttribute('data-miro-canvas-keyboard')==='open';`)) {
        await run(adb, ['-s', serial, 'shell', 'input keyevent KEYCODE_BACK'], { windowsHide: true, timeout: 12000 });
        await wait(800);
    }
    saved = await checked(`const f=app.workspace.getActiveFile(),c=app.workspace.activeLeaf.view.canvas;return {file:f.path,text:await app.vault.read(f),theme:app.vault.getConfig('theme'),settings:app.plugins.plugins['miro-canvas'].canvasSettings,viewport:{tx:c.tx,ty:c.ty,zoom:c.tZoom}};`);
    const stem = `CSS state ${serial ?? 'desktop'} ${Date.now()}`;
    const asset = stem + '.svg';
    const code = '**Example** \u00b7 JavaScript \u00b7 line-numbers\n\n```javascript\nconst answer = 42;\n```\n\nKeep this paragraph.';
    const board = { nodes: [{ id: 'card', type: 'text', text: 'Native card', x: 0, y: 0, width: 220, height: 140 }, { id: 'turned', type: 'text', text: 'Turned', x: 330, y: 0, width: 180, height: 110 }, { id: 'code', type: 'text', text: code, x: 0, y: 270, width: 440, height: 200 }, { id: 'image', type: 'file', file: asset, x: 560, y: 270, width: 200, height: 140 }], edges: [{ id: 'edge', fromNode: 'card', fromSide: 'right', toNode: 'turned', toSide: 'left' }], miroCanvas: { schemaVersion: 1, localOverrides: { turned: { rotation: 45 } } }, miroSource: { items: [{ id: 'code', type: 'code', data: { title: 'Example', language: 'JavaScript', lineNumbersVisible: true, code: 'const answer = 42;' }, future: { keep: true } }], future: { keep: true } } };
    await checked(`const p=app.plugins.plugins['miro-canvas'];p.m1Session.resetTools();
  await app.vault.create(${JSON.stringify(asset)},'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140"><rect width="200" height="140" fill="#aaa"/></svg>');
  const f=await app.vault.create(${JSON.stringify(stem + '.canvas')},${JSON.stringify(JSON.stringify(board))});await app.workspace.getLeaf(false).openFile(f,{active:true});return true;`);
    await wait(1100);
    await checked(`app.workspace.activeLeaf.view.canvas.zoomToFit();return true;`);
    await wait(900);
    for (const theme of ['obsidian', 'moonstone']) {
        await checked(`app.changeTheme(${JSON.stringify(theme)});app.updateTheme();return {dark:document.body.classList.contains('theme-dark'),light:document.body.classList.contains('theme-light')};`);
        await wait(350);
        const actualTheme = await checked(`return document.body.classList.contains('theme-dark')?'obsidian':document.body.classList.contains('theme-light')?'moonstone':'unknown';`);
        assert.equal(actualTheme, theme, 'actual app theme');
        for (const id of ['card', 'turned']) {
            await checked(`app.plugins.plugins['miro-canvas'].m1Session.resetTools();return true;`);
            await tap(await point(id));
            const state = await selection();
            results.push({ theme, id, ...state, data: undefined });
            console.log('SELECTION', serial ?? 'desktop', JSON.stringify(results.at(-1)));
            assert.deepEqual(state.ids, [id]);
            assert.equal(state.outline, id === 'card' ? 'none' : 'dashed');
            if (args.includes('--expect-marks'))
                assert.equal(state.mark, 'true');
        }
    }
    // Resize uses real ADB touch or renderer mouse input; DOM is inspected before release.
    for (const zoom of [0.5, 1.25]) {
        await checked(`const c=app.workspace.activeLeaf.view.canvas,n=c.nodes.get('card').getData();c.zoomToBbox({minX:n.x-90,minY:n.y-90,maxX:n.x+n.width+90,maxY:n.y+n.height+90});c.setViewport(c.tx,c.ty,Math.log2(${zoom}));return true;`);
        await wait(600);
        await checked(`const c=app.workspace.activeLeaf.view.canvas;c.deselectAll();c.selectOnly(c.nodes.get('card'));app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;`);
        await wait(900);
        const read = () => checked(`const c=app.workspace.activeLeaf.view.canvas,s=app.plugins.plugins['miro-canvas'].m1Session,e=c.edges.get('edge'),path=e.lineGroupEl.querySelector('path');return {node:c.nodes.get('card').getData(),path:path.getAttribute('d'),history:c.history.current,resizing:s.root.querySelector('.miro-canvas-handles').getAttribute('data-miro-canvas-resizing'),outline:getComputedStyle(s.root.querySelector('.miro-canvas-handles__frame')).outlineStyle,source:c.getData().miroSource};`);
        const control = selector => checked(`const root=app.plugins.plugins['miro-canvas'].m1Session.root,e=[...root.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width>0);if(!e){const s=app.plugins.plugins['miro-canvas'].m1Session;throw Error('missing visible control '+${JSON.stringify(selector)}+' '+JSON.stringify({root:root.className,rootAttrs:[...root.attributes].map(a=>[a.name,a.value]),dock:s.controls.element.outerHTML.slice(0,550),dockStyle:getComputedStyle(s.controls.element).display,parents:[s.controls.element.parentElement?.className,s.controls.element.parentElement?.parentElement?.className]}));}const r=e.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2},h=document.elementFromPoint(p.x,p.y);if(!e.contains(h))throw Error('obscured control: '+${JSON.stringify(selector)}+' rect '+JSON.stringify(r.toJSON())+' viewport '+innerWidth+'x'+innerHeight+' hit '+h?.outerHTML.slice(0,160));return p;`);
        const original = await read();
        const persisted = await checked(`return await app.vault.read(app.workspace.getActiveFile());`);
        const grip = await control('.miro-canvas-resizer[data-resize="top-right"]');
        const end = { x: grip.x + 35, y: grip.y };
        await input('down', grip);
        await input('move', end);
        await wait(250);
        const preview = await read();
        assert.ok(preview.node.width > original.node.width + 10, 'resize must change native geometry before release');
        assert.notEqual(preview.path, original.path, 'attached native edge must follow before release');
        assert.equal(preview.history, original.history, 'resize preview must not enter history');
        assert.equal(preview.resizing, 'top-right');
        assert.equal(preview.outline, 'dashed');
        assert.equal(await checked(`return await app.vault.read(app.workspace.getActiveFile());`), persisted, 'preview must not persist');
        await input('up', end);
        await wait(1000);
        const committed = await read();
        assert.equal(committed.history, original.history + 1);
        assert.equal(committed.node.width, preview.node.width);
        assert.equal(committed.path, preview.path);
        assert.deepEqual(committed.source, board.miroSource);
        if (serial && await checked(`return app.plugins.plugins['miro-canvas'].m1Session.root.getAttribute('data-miro-canvas-keyboard')==='open';`)) {
            await run(adb, ['-s', serial, 'shell', 'input keyevent KEYCODE_BACK'], { windowsHide: true, timeout: 12000 });
            await wait(800);
        }
        await checked(`app.workspace.activeLeaf.view.canvas.zoomToFit();return true;`);
        await wait(800);
        if (serial && await checked(`return app.plugins.plugins['miro-canvas'].m1Session.root.getAttribute('data-miro-canvas-keyboard')==='open';`)) {
            await run(adb, ['-s', serial, 'shell', 'input keyevent KEYCODE_BACK'], { windowsHide: true, timeout: 12000 });
            await wait(700);
        }
        await tap(await control('.miro-canvas-dock [data-icon="undo-2"]'));
        const undone = await read();
        console.log('UNDO', serial ?? 'desktop', zoom, JSON.stringify({ old: original.node, now: undone.node, h: undone.history }));
        assert.deepEqual(undone.node, original.node);
        assert.equal(undone.path, original.path);
        await tap(await control('.miro-canvas-dock [data-icon="redo-2"]'));
        assert.deepEqual((await read()).node, committed.node);
        await checked(`const c=app.workspace.activeLeaf.view.canvas,n=c.nodes.get('card').getData();c.zoomToBbox({minX:n.x-90,minY:n.y-90,maxX:n.x+n.width+90,maxY:n.y+n.height+90});c.setViewport(c.tx,c.ty,Math.log2(${zoom}));return true;`);
        await wait(600);
        await checked(`const c=app.workspace.activeLeaf.view.canvas;c.deselectAll();c.selectOnly(c.nodes.get('card'));app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;`);
        await wait(900);
        const cancelBefore = await read(), cancelGrip = await control('.miro-canvas-resizer[data-resize="top-right"]');
        await input('down', cancelGrip);
        await wait(120);
        const cancelledPress=await read();assert.equal(cancelledPress.resizing,'top-right','cancel test must capture the resize grip');
        await input('move', { x: cancelGrip.x + 25, y: cancelGrip.y });
        await wait(180);
        assert.notEqual((await read()).path, cancelBefore.path);
        if (serial)
            await input('cancel', cancelGrip);
        else {
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
            await input('up', cancelGrip);
        }
        await wait(1000);
        const cancelled = await read();
        assert.deepEqual(cancelled.node, cancelBefore.node);
        assert.equal(cancelled.path, cancelBefore.path);
        assert.equal(cancelled.history, cancelBefore.history);
        results.push({ resize: true, zoom, previewEdge: true, oneHistoryStep: true, undoRedo: true, cancel: true });
        console.log('RESIZE', serial ?? 'desktop', zoom, 'preview/commit/undo/redo/cancel passed');
    }
    await checked(`app.workspace.activeLeaf.view.canvas.zoomToFit();return true;`);
    await wait(900);
    // Simulate late native preview DOM without changing the board's text.
    const before = await checked(`return JSON.stringify(app.workspace.activeLeaf.view.canvas.getData());`);
    const codeResult = await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('code').nodeEl;
  const paragraphs=[...n.querySelectorAll('.markdown-preview-view p')];
  return paragraphs.map(p=>({text:p.textContent,next:p.nextElementSibling?.tagName,beforeCode:p.nextElementSibling?.tagName==='PRE'||p.parentElement?.nextElementSibling?.classList.contains('el-pre'),display:getComputedStyle(p).display,mark:p.getAttribute('data-miro-code-heading')}));`);
    console.log('CODE', serial ?? 'desktop', JSON.stringify(codeResult));
    assert.ok(codeResult.some(p => p.beforeCode && p.display === 'none'));
    assert.ok(codeResult.some(p => p.text.includes('Keep this') && p.display !== 'none'));
    await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('code').nodeEl,p=[...n.querySelectorAll('.markdown-preview-view p')].find(p=>p.nextElementSibling?.tagName==='PRE'||p.parentElement?.nextElementSibling?.classList.contains('el-pre'));
  const next=p.nextElementSibling?.tagName==='PRE'?p.nextElementSibling:p.parentElement.nextElementSibling.querySelector('pre'),ordinary=document.createElement('p');ordinary.textContent='Late heading';next.before(ordinary);window.__cssLateParagraph=ordinary;return true;`);
    await wait(250);
    const late = await checked(`return {display:getComputedStyle(window.__cssLateParagraph).display,mark:window.__cssLateParagraph.getAttribute('data-miro-code-heading')};`);
    assert.equal(late.display, 'none');
    if (args.includes('--expect-marks'))
        assert.equal(late.mark, 'true');
    await checked(`window.__cssLateParagraph.nextElementSibling.after(window.__cssLateParagraph);return true;`);
    await wait(250);
    assert.notEqual(await checked(`return getComputedStyle(window.__cssLateParagraph).display;`), 'none');
    await checked(`window.__cssLateParagraph.remove();delete window.__cssLateParagraph;return true;`);
    assert.equal(await checked(`return JSON.stringify(app.workspace.activeLeaf.view.canvas.getData());`), before);
    // Fallback names follow a late native direct label; this is controlled DOM timing.
    const fallback = await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,n=app.workspace.activeLeaf.view.canvas.nodes.get('image').nodeEl;
  window.__cssNativeNames=[...n.querySelectorAll('.canvas-node-label,.file-embed-title,.internal-embed-title')].map(e=>({element:e,parent:e.parentElement,next:e.nextSibling}));
  for(const row of window.__cssNativeNames)row.element.remove();s.refreshDecorations();
  const label=n.querySelector('.miro-canvas-attachment-label');if(!label)throw Error('fallback name missing');window.__cssFallback=label;
  return {display:getComputedStyle(label).display,mark:label.getAttribute('data-miro-native-label')};`);
    assert.notEqual(fallback.display, 'none');
    assert.equal(fallback.mark, 'false');
    await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('image').nodeEl,e=document.createElement('div');e.className='canvas-node-label';e.textContent='Late native name';n.append(e);window.__cssLateName=e;return true;`);
    await wait(200);
    assert.equal(await checked(`return getComputedStyle(window.__cssFallback).display;`), 'none');
    await checked(`window.__cssLateName.remove();delete window.__cssLateName;return true;`);
    await wait(200);
    assert.notEqual(await checked(`return getComputedStyle(window.__cssFallback).display;`), 'none');
    // Name visibility is toggled by the actual board-menu button.
    const toggleNames = async () => {
        const button = await checked(`const root=app.plugins.plugins['miro-canvas'].m1Session.root,e=[...root.querySelectorAll('.miro-canvas-dock__bar [data-icon="settings-2"]')].find(e=>e.getBoundingClientRect().width>0).closest('button'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,open:e.getAttribute('aria-expanded')==='true'};`);
        if (!button.open)
            await tap({ x: button.x, y: button.y });
        const row = await checked(`const e=app.plugins.plugins['miro-canvas'].m1Session.root.querySelector('.miro-canvas-dock__menu--board [data-icon="paperclip"]').closest('button'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
        await tap(row);
    };
    await toggleNames();
    assert.equal(await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('image').nodeEl;return n.querySelector('.miro-canvas-attachment-label')===null;`), true);
    await toggleNames();
    assert.equal(await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('image').nodeEl;return [...n.querySelectorAll('.canvas-node-label,.file-embed-title,.internal-embed-title,.miro-canvas-attachment-label')].some(e=>getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden');`), true);
    assert.deepEqual(await checked(`return app.workspace.activeLeaf.view.canvas.getData().miroSource;`), board.miroSource);
    results.push({ attachmentNameToggle: true });
    await checked(`for(const row of window.__cssNativeNames)row.parent.insertBefore(row.element,row.next?.parentNode===row.parent?row.next:null);
  delete window.__cssNativeNames;delete window.__cssFallback;app.plugins.plugins['miro-canvas'].m1Session.refreshDecorations();return true;`);
    const fixture = await checked(`return JSON.parse(await app.vault.read(app.workspace.getActiveFile()));`);
    await checked(`await app.plugins.disablePlugin('miro-canvas');return true;`);
    await wait(180);
    assert.equal(await checked(`return document.querySelectorAll('[data-miro-code-heading],.miro-canvas-attachment-label').length;`), 0);
    assert.deepEqual(await checked(`return JSON.parse(await app.vault.read(app.workspace.getActiveFile()));`), fixture);
    await checked(`await app.plugins.enablePlugin('miro-canvas');return true;`);
    await wait(900);
    assert.equal(await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('code').nodeEl,p=n.querySelector('.markdown-preview-view p');return getComputedStyle(p).display;`), 'none');
    results.push({ lateFallback: true, unloadRestore: true, unchangedSource: true });
    if (serial) {
        const captured = await run(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, encoding: 'buffer', maxBuffer: 12 * 1024 * 1024, timeout: 12000 });
        writeFileSync(new URL(`css-state-${serial}.png`, out), captured.stdout);
    }
    else
        writeFileSync(new URL('css-state-desktop.png', out), await screenshot(send));
    results.push({ lateCode: true, unchangedData: true });
}
finally {
    if (serial)
        await run(adb, ['-s', serial, 'shell', 'input touchscreen motionevent CANCEL 0 0'], { windowsHide: true, timeout: 12000 });
    writeFileSync(new URL(`css-state-${serial ?? 'desktop'}.json`, out), JSON.stringify(results, null, 2));
    if (saved)
        await checked(`const p=app.plugins.plugins['miro-canvas'];p.m1Session.resetTools();await p.saveCanvasSettings(${JSON.stringify(saved.settings)});app.changeTheme(${JSON.stringify(saved.theme)});app.updateTheme();
  await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(saved.file)}),{active:true});await new Promise(r=>setTimeout(r,500));
  app.workspace.activeLeaf.view.canvas.setViewport(${saved.viewport.tx},${saved.viewport.ty},${saved.viewport.zoom});return true;`);
    if (saved)
        assert.equal(await checked(`return await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(saved.file)}));`), saved.text, 'original board must remain unchanged');
    close();
}
