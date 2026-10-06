import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { connectByTitle, evaluate } from './cdp.mjs';
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const serial = args.includes('--serial') ? option('--serial') : undefined;
const port = Number(args.includes('--port') ? option('--port') : 9346);
const run = promisify(execFile);
const adb = 'C:/Program Files/VirtualTablet Server/adb/adb.exe';
const wait = ms => new Promise(r => setTimeout(r, ms));
if (serial) {
    await run(adb, ['-s', serial, 'shell', 'input keyevent KEYCODE_WAKEUP'], { windowsHide: true });
    await run(adb, ['-s', serial, 'shell', 'am start -n md.obsidian/md.obsidian.MainActivity'], { windowsHide: true });
}
const { send, close } = await connectByTitle(port, serial ? 'Obsidian' : undefined);
async function checked(code) {
    let timeout;
    let r;
    try {
        r = await Promise.race([evaluate(send, `if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!app.vault.adapter.basePath.replaceAll('\\\\','/').includes('/tools/obsidian_cdp/.out/'))throw Error('test vault required');` + code), new Promise((_, reject) => {
                timeout = setTimeout(() => reject(Error('Obsidian suspended')), 15000);
            })]);
    }
    finally {
        clearTimeout(timeout);
    }
    if (r?.error)
        throw Error(r.error);
    return r;
}
async function tap(selector) {
    const p = await checked(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width>0)?.closest('button');if(!e)throw Error('missing button '+${JSON.stringify(selector)}+' '+JSON.stringify({matches:document.querySelectorAll(${JSON.stringify(selector)}).length,bar:document.querySelector('.miro-canvas-dock__bar')?.outerHTML.slice(0,200),root:app.plugins.plugins['miro-canvas'].m1Session.root.outerHTML.slice(0,450)}));const r=e.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw Error('obscured button '+${JSON.stringify(selector)}+' rect '+JSON.stringify(r.toJSON())+' hit '+document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,150));return p;`);
    if (serial) {
        const focus = await run(adb, ['-s', serial, 'shell', 'dumpsys window'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
        assert.ok(focus.stdout.split('\n').find(l => l.includes('mCurrentFocus='))?.includes('md.obsidian/'), 'native app obscured');
        const dpr = await checked('return devicePixelRatio;');
        await run(adb, ['-s', serial, 'shell', `input tap ${Math.round(p.x * dpr)} ${Math.round(p.y * dpr)}`], { windowsHide: true });
    }
    else {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1 });
    }
    await wait(350);
}
let saved;
const result = { device: serial ?? 'Windows', search: [], capture: [] };
try {
    if (!serial)
        await checked(`const w=require('@electron/remote').getCurrentWindow();w.webContents.setBackgroundThrottling(false);w.hide();return true;`);
    saved = await checked(`const f=app.workspace.getActiveFile(),c=app.workspace.activeLeaf.view.canvas;return {file:f.path,text:await app.vault.read(f),theme:app.vault.getConfig('theme'),viewport:{tx:c.tx,ty:c.ty,zoom:c.tZoom}};`);
    const stem = 'Visibility ' + (serial ?? 'Windows') + ' ' + Date.now();
    const board = { nodes: [{ id: 'one', type: 'text', text: 'Find alpha', x: 0, y: 0, width: 160, height: 100 }, { id: 'two', type: 'text', text: 'Find beta', x: 230, y: 0, width: 160, height: 100 }], edges: [], miroCanvas: { schemaVersion: 1, export: { format: 'free', orientation: 'landscape', quality: 'standard', pages: [{ id: 'page', name: 'Page', x: -20, y: -20, width: 440, height: 140 }] } }, miroSource: { items: [], future: { keep: true } }, future: { keep: true } };
    await checked(`app.plugins.plugins['miro-canvas'].m1Session.resetTools();const f=await app.vault.create(${JSON.stringify(stem + '.canvas')},${JSON.stringify(JSON.stringify(board))});await app.workspace.getLeaf(false).openFile(f,{active:true});return true;`);
    await wait(800);
    const query = async (text) => {
        await checked(`const e=document.querySelector('.miro-canvas-search__input');e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
        await wait(500);
    };
    for (const theme of ['obsidian', 'moonstone']) {
        await checked(`app.changeTheme('${theme}');app.updateTheme();return true;`);
        await tap('.miro-canvas-dock__bar [data-icon="search"]');
        await query('Find');
        let state = await checked(`const r=document.querySelector('.miro-canvas-search'),h=document.querySelector('.miro-canvas-search-hit');return {bar:getComputedStyle(r).display,state:r.getAttribute('data-search-state'),hit:getComputedStyle(h).display,pointer:getComputedStyle(h).pointerEvents};`);
        assert.equal(state.bar, 'flex');
        assert.equal(state.state, 'found');
        assert.notEqual(state.hit, 'none');
        assert.equal(state.pointer, 'none');
        await tap('.miro-canvas-search button:nth-of-type(2)');
        await checked(`app.plugins.plugins['miro-canvas'].m1Session.root.classList.add('is-screenshotting');return true;`);
        assert.equal(await checked(`return getComputedStyle(document.querySelector('.miro-canvas-search-hit')).display;`), 'none');
        await checked(`app.plugins.plugins['miro-canvas'].m1Session.root.classList.remove('is-screenshotting');return true;`);
        await query('absent result');
        assert.equal(await checked(`return getComputedStyle(document.querySelector('.miro-canvas-search-hit')).display;`), 'none');
        await tap('.miro-canvas-search button:nth-of-type(3)');
        assert.equal(await checked(`return getComputedStyle(document.querySelector('.miro-canvas-search')).display;`), 'none');
        await tap('.miro-canvas-dock__bar [data-icon="search"]');
        assert.equal(await checked(`return getComputedStyle(document.querySelector('.miro-canvas-search')).display;`), 'flex');
        await tap('.miro-canvas-search button:nth-of-type(3)');
        result.search.push({ theme, found: true, next: true, none: true, closeReopen: true, screenshotHidden: true });
    }
    if (serial && await checked(`return app.plugins.plugins['miro-canvas'].m1Session.root.getAttribute('data-miro-canvas-keyboard')==='open';`)) {
        await run(adb, ['-s', serial, 'shell', 'input keyevent KEYCODE_BACK'], { windowsHide: true });
        await wait(600);
    }
    await tap('.miro-canvas-dock__bar [data-icon="settings-2"]');
    await tap('.miro-canvas-dock__menu--board [data-icon="file-output"]');
    const baseline = await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;window.__visibilityCapture=[];const inspect=()=>{const e=s.exporting;if(!e)return;if(e.panel.element.hidden&&e.overlay.element.hidden)window.__visibilityCapture.push({panel:getComputedStyle(e.panel.element).display,pages:getComputedStyle(e.overlay.element).display});};window.__visibilityObserver=new MutationObserver(inspect);window.__visibilityObserver.observe(s.exporting.panel.element,{attributes:true,attributeFilter:['hidden']});window.__visibilityObserver.observe(s.exporting.overlay.element,{attributes:true,attributeFilter:['hidden']});return {pdfs:app.vault.getFiles().filter(f=>f.extension==='pdf').map(f=>f.path),data:app.workspace.activeLeaf.view.canvas.getData()};`);
    await tap('.miro-canvas-export__out button.mod-cta');
    let pdf;
    for (let attempt = 0; attempt < 20; attempt++) {
        await wait(500);
        pdf = await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,f=app.vault.getFiles().find(f=>f.extension==='pdf'&&!${JSON.stringify(baseline.pdfs)}.includes(f.path));return {busy:s.exporting?.busy,path:f?.path,capture:window.__visibilityCapture,panel:s.exporting?getComputedStyle(s.exporting.panel.element).display:null,pages:s.exporting?getComputedStyle(s.exporting.overlay.element).display:null};`);
        if (pdf.path && !pdf.busy)
            break;
    }
    assert.ok(pdf.path, 'PDF must be saved');
    assert.ok(pdf.capture.length > 0, 'capture must hide roots');
    assert.ok(pdf.capture.every(r => r.panel === 'none' && r.pages === 'none'));
    assert.equal(pdf.panel, 'grid');
    assert.equal(pdf.pages, 'block');
    const header = await checked(`const bytes=new Uint8Array(await app.vault.readBinary(app.vault.getAbstractFileByPath(${JSON.stringify(pdf.path)})));return {size:bytes.length,head:String.fromCharCode(...bytes.slice(0,5))};`);
    assert.equal(header.head, '%PDF-');
    assert.ok(header.size > 500);
    assert.deepEqual(await checked(`return app.workspace.activeLeaf.view.canvas.getData();`), baseline.data);
    result.capture = pdf.capture;
    result.pdf = { path: pdf.path, ...header };
    await wait(700);
    await tap('.miro-canvas-export__close');
    await wait(500);
    assert.equal(await checked(`return document.querySelectorAll('.miro-canvas-export,.miro-canvas-export-pages').length;`), 0);
    console.log(JSON.stringify(result));
}
catch (error) {
    console.error('CHECK FAILURE', error.message);
    throw error;
}
finally {
    await checked(`window.__visibilityObserver?.disconnect();delete window.__visibilityObserver;delete window.__visibilityCapture;const s=app.plugins.plugins['miro-canvas'].m1Session;s.closeSearch();s.closeExport();s.root.classList.remove('is-screenshotting');return true;`).catch(() => {
    });
    if (saved) {
        await checked(`app.changeTheme(${JSON.stringify(saved.theme)});app.updateTheme();await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(saved.file)}),{active:true});await new Promise(r=>setTimeout(r,600));app.workspace.activeLeaf.view.canvas.setViewport(${saved.viewport.tx},${saved.viewport.ty},${saved.viewport.zoom});return true;`);
        const restored = await checked(`return await app.vault.read(app.workspace.getActiveFile());`);
        assert.deepEqual(JSON.parse(restored), JSON.parse(saved.text), 'original document unchanged');
    }
    writeFileSync(new URL(`.out/visibility-${serial ?? 'Windows'}.json`, import.meta.url), JSON.stringify(result, null, 2));
    if (!serial)
        assert.equal(await checked(`return require('@electron/remote').getCurrentWindow().isVisible();`), false);
    close();
}
