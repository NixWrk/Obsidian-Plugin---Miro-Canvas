// Native acceptance without foregrounding or capturing the user's screen.
// Fixture/selection preparation is instrumented; actions use renderer input or ADB.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { connectByTitle, evaluate } from './cdp.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option('--port', '9346'));
const serial = option('--serial');
const phase = option('--phase', 'groups');
const cancelKey = option('--cancel-key', serial ? 'adb' : 'cdp');
assert.ok(['adb', 'cdp'].includes(cancelKey), 'cancel-key must be adb or cdp');
assert.ok(cancelKey !== 'adb' || serial, 'ADB cancellation requires a device serial');
const run = promisify(execFile);
const adb = process.env.ADB ?? 'C:/Program Files/VirtualTablet Server/adb/adb.exe';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const client = await connectByTitle(port, serial ? 'Obsidian' : undefined);
const out = new URL('./.out/feature-expansion/', import.meta.url);
mkdirSync(out, { recursive: true });
const receipt = { phase, device: serial ?? 'Windows', cancelKey, input: serial ? 'ADB action taps; CDP text/preparation' : 'trusted CDP renderer input; bounded native frame preparation', checks: [], passed: false };
async function checked(body) {
  let timer;
  try {
    const result = await Promise.race([evaluate(client.send, `
      if(app.isMobile ? app.vault.getName()!=='MiroCanvasTest' : !app.vault.adapter.basePath.replaceAll('\\\\','/').includes('/tools/obsidian_cdp/.out/l20-windows/vault'))throw Error('test vault required');
      if(!app.isMobile){const w=require('@electron/remote').getCurrentWindow();if(w.isVisible()||w.isFocused())throw Error('hidden background window required');}
      ${body}`), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Obsidian suspended')), 20000); })]);
    if (result?.error) throw Error(result.error);
    return result;
  } finally { clearTimeout(timer); }
}
async function pump() {
  await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=s?.view.canvas;if(!c)return;
    if(!app.isMobile){c.cancelFrame();const nativeRaf=window.requestAnimationFrame,pending=[];
      try{window.requestAnimationFrame=f=>{pending.push(f);return 1;};c.finishViewportAnimation=true;c.requestFrame(performance.now()-1000);
        for(let i=0;i<8&&pending.length;i++)pending.shift()(performance.now());}
      finally{window.requestAnimationFrame=nativeRaf;c.cancelFrame();}}
    s.refresh();return true;`);
  await wait(180);
}
async function tap(selector, text) {
  const point = await checked(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width&&(${text === undefined ? 'true' : `(e.textContent.includes(${JSON.stringify(text)})||e.getAttribute('aria-label')?.includes(${JSON.stringify(text)}))`}));
    if(!e)throw Error('missing control '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',inline:'nearest'});const r=e.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};
    if(!e.contains(document.elementFromPoint(p.x,p.y)))throw Error('obscured control '+${JSON.stringify(selector)});return p;`);
  if (serial) {
    const focus = await run(adb, ['-s', serial, 'shell', 'dumpsys window'], { windowsHide: true, timeout: 12000, maxBuffer: 8 * 1024 * 1024 });
    assert.ok(focus.stdout.split('\n').find(line => line.includes('mCurrentFocus='))?.includes('md.obsidian/'), 'Android foreground must be Obsidian');
    const dpr = await checked('return devicePixelRatio;');
    await run(adb, ['-s', serial, 'shell', `input tap ${Math.round(point.x*dpr)} ${Math.round(point.y*dpr)}`], { windowsHide: true, timeout: 12000 });
  } else {
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  }
  await wait(300);
  await pump();
}
async function command(id) {
  const label = await checked(`const id=${JSON.stringify(`miro-canvas:${id}`)},command=app.commands.commands[id];
    if(!command)throw Error('missing command');app.commands.executeCommandById('command-palette:open');return command.name;`);
  await wait(150);
  await client.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
  await client.send('Input.insertText', { text: label });
  await wait(250);
  await tap('.suggestion-item', label.replace(/^Miro Canvas:\s*/u, ''));
}
async function key(key, code, modifiers=0) {
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, modifiers, windowsVirtualKeyCode: key === 'Escape' ? 27 : key.toUpperCase().charCodeAt(0) });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: key === 'Escape' ? 27 : key.toUpperCase().charCodeAt(0) });
  await wait(220); await pump();
}
async function select(ids) {
  await checked(`const c=app.workspace.activeLeaf.view.canvas;c.deselectAll();for(const id of ${JSON.stringify(ids)})c.select(c.nodes.get(id)??c.edges.get(id));return true;`);
  await pump();
}
async function geometry() {
  return checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=s.view.canvas,d=c.getData();
    return {nodes:d.nodes,runtimeNodes:[...c.nodes].map(([id,n])=>({id,x:n.x,y:n.y})),projectedNodes:s.currentRawDocument?.nodes,metadata:d.miroCanvas,source:d.miroSource,history:{length:c.history.data.length,current:c.history.current},
      hidden:Object.fromEntries([...c.nodes].map(([id,n])=>[id,n.nodeEl.classList.contains('miro-canvas-group-hidden')])),
      groupClass:c.nodes.get('group').nodeEl.className,
      nativePath:c.edges.get('external').lineGroupEl?.querySelector('path')?.getAttribute('d'),
      ownPaths:[...s.root.querySelectorAll('[data-connector-id]')].map(e=>({id:e.dataset.connectorId,d:e.getAttribute('d')})),
      pins:[...s.root.querySelectorAll('.miro-canvas-comment-marker')].map(e=>({id:e.dataset.commentId,hidden:e.hidden,display:getComputedStyle(e).display}))};`);
}
let prior;
try {
  if(!serial)await client.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  prior = await checked(`const p=app.plugins.plugins['miro-canvas'];for(const modal of p.enhancementModals)modal.close();return {path:app.workspace.getActiveFile()?.path,settings:structuredClone(p.canvasSettings)};`);
  await checked(readFileSync(new URL('./canvas-enhancement-fixture.js', import.meta.url), 'utf8'));
  await pump();
  await checked(`const c=app.workspace.activeLeaf.view.canvas;c.setViewport(140,32,0);return true;`); await pump();
  receipt.runtime = await checked(`return {vault:app.vault.getName(),version:app.plugins.plugins['miro-canvas'].manifest.version, userAgent:navigator.userAgent,mobile:app.isMobile};`);
  const initial = await geometry();
  if (phase === 'groups') {
    await command('toggle-group-collapse');
    const collapsed = await geometry();
    assert.ok(collapsed.groupClass.includes('miro-canvas-group-collapsed'));
    assert.equal(collapsed.hidden.a, true); assert.equal(collapsed.hidden.b, true);
    assert.deepEqual(collapsed.nodes, initial.nodes, 'collapse must retain native geometry');
    assert.deepEqual(collapsed.source, initial.source);
    assert.equal(collapsed.history.length, initial.history.length+1);
    assert.ok(collapsed.nativePath?.startsWith('M280 32') || collapsed.nativePath?.startsWith('M 280 32'), JSON.stringify(collapsed));
    receipt.checks.push({ name: 'collapse via native command palette', geometry: collapsed });
    await key('z', 'KeyZ', 2);
    const undone = await geometry(); assert.equal(undone.hidden.a, false); assert.ok(!undone.groupClass.includes('miro-canvas-group-collapsed'));
    await key('z', 'KeyZ', 10);
    const redone = await geometry(); assert.equal(redone.hidden.a, true);
    receipt.checks.push({name:'native Undo/Redo repaints without manual session mutation', history:redone.history});
    {
      // Native touch waits 600 ms before dragging; a continuous swipe pans instead.
      // Trace and device evidence: docs/native-group-gesture-checks.md.
      const failures = [];
      let pendingInput;
      let heldPoint;
      let density = 1;
      const verify = (name, check) => {
        try { check(); } catch (error) { failures.push({ name, error: String(error) }); }
      };
      const adbInput = async command => {
        pendingInput = run(adb, ['-s', serial, 'shell', command], { windowsHide: true, timeout: 12000 });
        try { await pendingInput; } finally { pendingInput = undefined; }
      };
      const motion = async (action, point) => {
        if (action === 'DOWN') heldPoint = point;
        if (serial) await adbInput(`input touchscreen motionevent ${action} ${Math.round(point.x*density)} ${Math.round(point.y*density)}`);
        else if (action === 'CANCEL') await key('Escape', 'Escape');
        else await client.send('Input.dispatchMouseEvent', {
          type: action === 'DOWN' ? 'mousePressed' : action === 'UP' ? 'mouseReleased' : 'mouseMoved',
          ...point, button: 'left', buttons: action === 'UP' ? 0 : 1, clickCount: 1,
        });
        if (action === 'UP' || action === 'CANCEL' && serial) heldPoint = undefined;
      };
      const sample = async () => ({ ...await geometry(), ...await checked(`
        const s=app.plugins.plugins['miro-canvas'].m1Session,c=s.view.canvas,e=c.edges.get('external'),f=app.workspace.getActiveFile();
        return {viewport:{x:c.x,y:c.y,scale:c.scale},previewActive:!!s.selectionMovePreview,
          displayPath:e.lineGroupEl.querySelector('.canvas-display-path')?.getAttribute('d'),
          hitPath:e.lineGroupEl.querySelector('.canvas-interaction-path')?.getAttribute('d'),
          future:c.getData().future,save:{dirty:s.view.dirty,saving:s.view.saving},disk:JSON.parse(await app.vault.read(f))};`) });
      const start = path => {
        const match = path?.match(/^M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/u);
        assert.ok(match, `path start unavailable: ${path}`);
        return { x: Number(match[1]), y: Number(match[2]) };
      };
      const close = (actual, expected, message) => assert.ok(Math.abs(actual-expected)<0.05, `${message}: ${actual} != ${expected}`);
      const undo = async () => {
        if (serial) await adbInput('input keycombination 113 54');
        else await key('z', 'KeyZ', 2);
        await wait(1400);
        if (!serial) await pump();
      };
      try {
        for (const scale of [0.5, 1.25]) {
          for (const ending of ['commit', 'cancel']) {
            await select(['group']);
            await checked(`const c=app.workspace.activeLeaf.view.canvas;c.setViewport(140,160,Math.log2(${scale}));return true;`);
            await pump();
            await wait(700);
            const before = await sample();
            const target = await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('group');
              for(const selector of ['.canvas-node-container','.canvas-group-label']){const e=n.nodeEl.querySelector(selector);if(!e)continue;const r=e.getBoundingClientRect();
                for(const u of [.5,.25,.75])for(const v of [.5,.25,.75]){const p={x:Math.round((r.x+r.width*u)*devicePixelRatio)/devicePixelRatio,y:Math.round((r.y+r.height*v)*devicePixelRatio)/devicePixelRatio},hit=document.elementFromPoint(p.x,p.y);
                  if(e.contains(hit)&&hit.closest('.canvas-node')===n.nodeEl&&!hit.closest('[contenteditable=true],button,.canvas-node-resizer')&&[-2,2].every(d=>e.contains(document.elementFromPoint(p.x,p.y+d))))return {...p,selector,hit:hit.tagName,dpr:devicePixelRatio};}}
              throw Error('native compact group has no uncovered non-editing hit target');`);
            density = target.dpr;
            const point = { x: target.x, y: target.y };
            if (serial) {
              const focus = await run(adb, ['-s', serial, 'shell', 'dumpsys window'], { windowsHide: true, timeout: 12000, maxBuffer: 8*1024*1024 });
              assert.ok(focus.stdout.split('\n').find(line=>line.includes('mCurrentFocus='))?.includes('md.obsidian/'), 'existing Android focus must be Obsidian');
            }
            await motion('DOWN', point);
            if (serial) await wait(850);
            await motion('MOVE', { x: point.x+10, y: point.y+7 });
            await wait(80);
              const moved = { x: point.x+120, y: point.y+95 };
            await motion('MOVE', moved);
            heldPoint = moved;
            await wait(250);
            if (!serial) await pump();
            const preview = await sample();
            receipt.checks.push({ name: `held group ${ending} ${scale}`, input: serial ? 'real ADB touchscreen DOWN; stationary 850ms; two MOVE events; no release' : 'trusted CDP mouse held', target, before, geometry: preview });
            verify(`held group paths ${ending} ${scale}`, () => {
              close(preview.viewport.scale, scale, 'actual viewport scale');
              const group = preview.projectedNodes.find(node=>node.id==='group'), base = before.projectedNodes.find(node=>node.id==='group');
              const dx = group.x-base.x, dy = group.y-base.y;
              assert.ok(Math.hypot(dx,dy)>1, 'held group gesture must move displayed geometry');
              for (const id of ['a','b']) {
                const child = preview.projectedNodes.find(node=>node.id===id), old = before.projectedNodes.find(node=>node.id===id);
                close(child.x, old.x+dx, `${id} preview x`); close(child.y, old.y+dy, `${id} preview y`);
              }
              const native = start(preview.displayPath);
              close(native.x, 280+group.x, 'native displayed compact endpoint x'); close(native.y, 32+group.y, 'native displayed compact endpoint y');
              assert.equal(preview.hitPath, preview.displayPath, 'native hit path shares displayed route');
              assert.deepEqual(preview.history, before.history, 'held preview adds no history');
              assert.deepEqual(preview.disk, before.disk, 'held preview does not persist');
            });
            verify(`held dependent chain ${ending} ${scale}`, () => {
              const group = preview.projectedNodes.find(node=>node.id==='group'), base = before.projectedNodes.find(node=>node.id==='group');
              const dx = group.x-base.x, dy = group.y-base.y;
              assert.ok(Math.hypot(dx,dy)>1, 'chain check requires a real group preview');
              const chain = start(preview.ownPaths.find(path=>path.id==='chain')?.d), oldChain = start(before.ownPaths.find(path=>path.id==='chain')?.d);
              close(chain.x, oldChain.x+dx, 'dependent chain preview x'); close(chain.y, oldChain.y+dy, 'dependent chain preview y');
            });
            if (ending === 'cancel') {
              if (serial && cancelKey === 'adb') await adbInput('input keyevent 111');
              else await key('Escape', 'Escape');
            }
            await motion('UP', moved);
            if (heldPoint) await motion('UP', moved);
            await wait(1500);
            if (!serial) await pump();
            let finished = await sample();
            const saveDeadline = Date.now()+4500;
            while (ending === 'commit' && Date.now()<saveDeadline && finished.disk.nodes.some(node => {
              const live = finished.nodes.find(value=>value.id===node.id);
              return live?.x!==node.x || live?.y!==node.y;
            })) {
              await wait(300);
              finished = await sample();
            }
            receipt.checks.push({ name: `group ${ending} ${scale}`, input: serial ? ending==='cancel'?`${cancelKey === 'adb' ? 'real ADB' : 'CDP renderer'} Escape key then real ADB touchscreen UP`:'real ADB touchscreen UP' : 'trusted CDP mouse release/Escape', geometry: finished });
            verify(`group ${ending} outcome ${scale}`, () => {
              assert.equal(finished.nodes.find(node=>node.id==='group').width, 900);
              assert.equal(finished.nodes.find(node=>node.id==='group').height, 500);
              assert.ok(finished.metadata.localOverrides.group.groupCollapse);
              assert.deepEqual(finished.source, before.source); assert.deepEqual(finished.future, before.future);
              if (ending === 'cancel') {
                assert.deepEqual(finished.nodes, before.nodes, 'cancel restores exact native positions');
                assert.deepEqual(finished.metadata, before.metadata, 'cancel restores connector/comment anchors');
                assert.deepEqual(finished.history, before.history, 'cancel adds no history');
                assert.deepEqual(finished.disk, before.disk, 'cancel does not save');
              } else {
                assert.deepEqual(finished.nodes, preview.projectedNodes, 'commit keeps the sampled preview positions');
                assert.equal(finished.history.current, before.history.current+1, 'one native history step');
                assert.equal(finished.history.length, before.history.current+2, 'native push truncates redo');
                assert.deepEqual(finished.disk.nodes, finished.nodes, 'commit persists native positions');
              }
            });
            if (finished.history.current > before.history.current) await undo();
            const restored = await sample();
            receipt.checks.push({ name: `group restore after ${ending} ${scale}`, geometry: restored });
            verify(`group restore after ${ending} ${scale}`, () => {
              assert.deepEqual(restored.nodes, before.nodes, 'Undo restores exact node positions');
              assert.deepEqual(restored.metadata, before.metadata, 'Undo restores complete metadata');
              assert.deepEqual(restored.source, before.source);
              assert.equal(restored.history.current, before.history.current);
            });
          }
        }
      } finally {
        if (pendingInput) await pendingInput.catch(error => { receipt.groupCleanupError = String(error); });
        if (heldPoint) await motion('UP', heldPoint).catch(error => { receipt.groupCleanupError = String(error); });
        receipt.groupFailures = failures;
      }
      assert.deepEqual(failures, [], 'groups gesture/preview failures; inspect native receipt');
    }
  } else if (phase === 'search') {
    await command('toggle-group-collapse');
    await command('m1-search-board');
    await tap('.miro-canvas-search__input');
    await client.send('Input.insertText',{text:'Launch'});await wait(500);await pump();
    assert.equal(await checked(`return document.querySelector('.miro-canvas-search').dataset.searchState;`),'found');
    assert.equal((await geometry()).hidden.a,false,'search temporarily reveals collapsed child');
    await tap('.miro-canvas-search [data-search-option="regex"]');
    await tap('.miro-canvas-search__input');await key('a','KeyA',2);await client.send('Input.insertText',{text:'['});await wait(500);await pump();
    assert.equal(await checked(`return document.querySelector('.miro-canvas-search__input').getAttribute('aria-invalid');`),'true');
    await key('Escape','Escape');
    assert.equal((await geometry()).hidden.a,true,'closing search restores collapse');
    receipt.checks.push({name:'typed query, collapsed peek, malformed regex, close restoration'});
  } else if (phase === 'embeds') {
    const boardPath=await checked('return app.workspace.getActiveFile().path;');
    const notePath=`Canvas card embed ${Date.now()}.md`;
    await checked(`const f=await app.vault.create(${JSON.stringify(notePath)},${JSON.stringify(`![[${boardPath}#node-a]]`)});const leaf=app.workspace.getLeaf(false);await leaf.openFile(f,{active:true,state:{mode:'preview'}});await app.workspace.revealLeaf(leaf);app.workspace.setActiveLeaf(leaf,{focus:false});return true;`);
    await checked(`const r=app.workspace.activeLeaf.view.previewMode.renderer;r.onResize();if(!app.isMobile)r.onRender();return true;`);
    await wait(1800);
    await checked(`const r=app.workspace.activeLeaf.view.previewMode.renderer;if(!app.isMobile)r.onRender();return true;`);
    const embed=await checked(`const e=app.workspace.activeLeaf.view.previewMode.containerEl.querySelector('.miro-canvas-card-embed');return {viewState:app.workspace.activeLeaf.view.getState(),previewRect:app.workspace.activeLeaf.view.previewMode.containerEl.getBoundingClientRect().toJSON(),state:e?.dataset.cardState,text:e?.textContent,wholeBoards:document.querySelectorAll('.markdown-preview-view .canvas-wrapper').length,creators:document.querySelectorAll('[data-miro-canvas-card-creator]').length};`);
    assert.equal(embed.state,'ready',JSON.stringify(embed));
    assert.ok(embed.text.includes('Launch card'),JSON.stringify(embed));
    assert.ok(!embed.text.includes('Second card'));
    assert.equal(embed.wholeBoards,0);
    receipt.checks.push({name:'native Markdown embeds one card',embed});
    await tap('.markdown-preview-view .miro-canvas-card-embed__open');await wait(500);await pump();
    const opened=await checked(`const c=app.workspace.activeLeaf.view.canvas;return {path:app.workspace.getActiveFile().path,selected:[...c.selection].map(e=>e.id)};`);
    assert.equal(opened.path,boardPath);assert.deepEqual(opened.selected,['a']);
    receipt.checks.push({name:'real click opens and selects embedded card',opened});
  } else if (phase === 'transfer') {
    await select(['outside']);
    await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,b=s.actionSnapshot();s.applyFeatureDocument(b,b,true);
      const nativeApply=s.authoring.applyDocument;s.authoring.applyDocument=function(...args){const result=Reflect.apply(nativeApply,this,args);globalThis.featureApplyResult={ok:result.ok,diagnostics:result.diagnostics};return result;};return true;`);
    const source=await checked('return app.workspace.getActiveFile().path;');
    const target=`Canvas transfer ${Date.now()}`;
    await command('encapsulate-selection');
    await tap('.miro-canvas-enhancement-modal input[type="text"]');await key('a','KeyA',2);
    await client.send('Input.insertText',{text:target});
    await tap('.miro-canvas-enhancement-modal button.mod-cta');await wait(1800);await pump();
    const result=await checked(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(target+'.canvas')}),p=app.plugins.plugins['miro-canvas'],s=p.m1Session;return {file:!!f,target:f?JSON.parse(await app.vault.read(f)):null,source:s.view.canvas.getData(),receipt:p.transferReceipt,apply:globalThis.featureApplyResult,status:document.querySelector('.miro-canvas-enhancement-modal')?.textContent};`);
    receipt.checks.push({name:'transfer publication state',result});
    assert.equal(result.file,true,JSON.stringify(result));
    assert.ok(result.target.nodes.some(n=>n.id==='outside'));
    assert.ok(!result.source.nodes.some(n=>n.id==='outside'));
    assert.ok(result.source.nodes.some(n=>n.type==='file'&&n.file===target+'.canvas'));
    assert.deepEqual(result.source.miroSource,initial.source);
    await key('z','KeyZ',2);
    const undone=await checked(`return {nodes:app.workspace.activeLeaf.view.canvas.getData().nodes,target:!!app.vault.getAbstractFileByPath(${JSON.stringify(target+'.canvas')}),path:app.workspace.getActiveFile().path};`);
    assert.ok(undone.nodes.some(n=>n.id==='outside'));assert.equal(undone.target,true);assert.equal(undone.path,source);
    receipt.checks.push({name:'native transfer publishes target, source Undo retains target',target:target+'.canvas'});
  } else if (phase === 'notes') {
    const stem=`Canvas note relation ${Date.now()}`,first=stem+' A.md',second=stem+' B.md',renamed=stem+' Renamed.md';
    await checked(`await app.vault.create(${JSON.stringify(second)},'Target note');await app.vault.create(${JSON.stringify(first)},${JSON.stringify(`---\nrelated: '[[${second.slice(0,-3)}]]'\n---\nNeedle linked file content`)});
      const s=app.plugins.plugins['miro-canvas'].m1Session,b=s.actionSnapshot(),next=structuredClone(b);
      next.nodes.push({id:'reference-file',type:'file',file:${JSON.stringify(first)},x:1400,y:0,width:180,height:120},{id:'target-file',type:'file',file:${JSON.stringify(second)},x:1650,y:0,width:180,height:120});
      next.nodes.find(n=>n.id==='a').text=${JSON.stringify(`[[${second.slice(0,-3)}]] Launch card`)};
      if(!s.applyFeatureDocument(next,b))throw Error('note fixture preparation failed');return true;`);await wait(1300);await pump();
    await command('m1-search-board');await tap('.miro-canvas-search__input');await client.send('Input.insertText',{text:'Needle'});await wait(1000);await pump();
    const search=await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;return {state:s.searchBar.element.dataset.searchState,entry:s.currentSearchEntry()};`);
    assert.equal(search.state,'found',JSON.stringify(search));assert.ok(search.entry.key.includes('reference-file'),JSON.stringify(search));
    await key('Escape','Escape');await command('update-property-edges');
    const related=await checked(`return app.workspace.activeLeaf.view.canvas.getData().edges.filter(e=>e.fromNode==='reference-file'&&e.toNode==='target-file');`);
    assert.equal(related.length,1,JSON.stringify(related));
    const source=await checked('return app.workspace.getActiveFile().path;');
    const preRename=await checked(`const p=app.plugins.plugins['miro-canvas'],f=app.workspace.getActiveFile();return {knowledge:p.boardIndex.getKnowledge(f.path),cache:app.metadataCache.getFileCache(f),clean:app.metadataCache.isCacheClean()};`);
    receipt.checks.push({name:'linked-note content search and native property-edge command',search,related,preRename});
    const renamePromise=checked(`await app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(second)}),${JSON.stringify(renamed)});return true;`);
    for(let attempt=0;attempt<50;attempt++){
      const label=await checked(`return [...document.querySelectorAll('.modal-container button')].find(e=>/Just once|Только.*раз|Один раз/iu.test(e.textContent))?.textContent;`);
      if(label){await tap('.modal-container button',label);break;}
      const renameSettled=await checked(`return app.vault.getAbstractFileByPath(${JSON.stringify(renamed)})!==null&&app.metadataCache.isCacheClean();`);
      if(renameSettled)break;
      await wait(120);
    }
    await renamePromise;await checked(`await app.plugins.plugins['miro-canvas'].renameWork;return true;`);await wait(1800);await pump();
    const renamedState=await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;return {nodes:s.view.canvas.getData().nodes,source:s.view.canvas.getData().miroSource};`);
    assert.equal(renamedState.nodes.find(n=>n.id==='target-file').file,renamed);assert.ok(renamedState.nodes.find(n=>n.id==='a').text.includes(stem+' Renamed'),JSON.stringify(renamedState));assert.deepEqual(renamedState.source,initial.source);
    receipt.checks.push({name:'native FileManager rename updates file and Markdown card references; source preserved',source,renamedState});
  } else if (phase === 'edges') {
    await checked(`app.workspace.activeLeaf.view.canvas.setViewport(700,160,-1);return true;`);await pump();
    await select(['external']);
    const before=await checked(`const c=app.workspace.activeLeaf.view.canvas;return {edge:c.edges.get('external').getData(),history:c.history.data.length};`);
    await command('flip-edges');
    const after=await checked(`const c=app.workspace.activeLeaf.view.canvas;return {edge:c.edges.get('external').getData(),history:c.history.data.length};`);
    assert.equal(after.edge.fromNode,before.edge.toNode);assert.equal(after.edge.toNode,before.edge.fromNode);
    assert.equal(after.edge.fromEnd,'arrow');assert.equal(after.edge.toEnd,'none');assert.equal(after.history,before.history+1);
    await key('z','KeyZ',2);await select(['a']);await command('select-connected-lines');
    const selected=await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session;return {ids:s.selectionForTransfer().ids,ends:s.selectionForTransfer().routeEnds,highlight:s.root.querySelectorAll('.miro-canvas-line-related').length};`);
    receipt.checks.push({name:'Flip/selection state',before,after,selected});
    assert.ok(selected.ids.includes('external')&&selected.ids.includes('internal'));assert.ok(!selected.ids.includes('outside'));
    assert.deepEqual(selected.ends.external,{from:true,to:false,wholeRoute:false});assert.ok(selected.highlight>=2);
    receipt.checks.push({name:'native Flip reverses endpoints/caps in one step; connected selection preserves far-end mask',before,after,selected});
  } else if (phase === 'integration') {
    const boardPath=await checked('return app.workspace.getActiveFile().path;');
    await command('board-properties');await tap('.miro-canvas-properties-input');await key('a','KeyA',2);
    await client.send('Input.insertText',{text:'tags:\n  - featureboard\naliases:\n  - Feature Alias\nstatus: approved\nrelated: "[[Feature Reference]]"\n'});
    await tap('.miro-canvas-enhancement-modal button.mod-cta');await wait(1200);await pump();
    const cache=await checked(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(boardPath)}),c=app.metadataCache.getFileCache(f),s=app.plugins.plugins['miro-canvas'].m1Session;return {properties:c?.frontmatter,raw:s.view.canvas.getData().miroCanvas?.properties,busy:s.featureBusy(),status:document.querySelector('.miro-canvas-enhancement-status')?.textContent,input:document.querySelector('.miro-canvas-properties-input')?.value,links:app.metadataCache.resolvedLinks[f.path],backlinks:[...app.metadataCache.getBacklinksForFile(app.vault.getAbstractFileByPath('Feature Reference.md')).data.keys()]};`);
    receipt.checks.push({name:'property save state',cache});
    assert.equal(cache.properties?.status,'approved',JSON.stringify(cache));assert.ok(cache.links['Feature Reference.md']>=1);assert.ok(cache.backlinks.includes(boardPath));
    receipt.checks.push({name:'properties UI projects native metadata/cache/references',cache});
    const propertyPath=`Canvas property mention ${Date.now()}.canvas`;
    await checked(`await app.vault.create(${JSON.stringify(propertyPath)},JSON.stringify({nodes:[],edges:[],miroCanvas:{schemaVersion:1,properties:{related:'[[Feature Reference]]'}}}));return true;`);await wait(1600);
    const backlinkLeafId=await checked(`const file=app.vault.getAbstractFileByPath('Feature Reference.md');await app.workspace.getLeaf(false).openFile(file,{active:true});const noteLeaf=app.workspace.activeLeaf;
      const leaf=app.isMobile?app.workspace.getRightLeaf(false):app.workspace.getLeavesOfType('backlink').find(l=>l.view.backlink)??app.workspace.getLeaf(false);
      await leaf.setViewState({type:'backlink',state:{file:file.path}});await app.workspace.revealLeaf(leaf);app.workspace.rightSplit.expand();
      await leaf.view.loadFile(file);app.workspace.setActiveLeaf(noteLeaf,{focus:false});return leaf.id;`);await wait(1200);
    const backlink=await checked(`const v=app.workspace.getLeavesOfType('backlink').find(l=>l.id===${JSON.stringify(backlinkLeafId)}).view,b=v.backlink;app.plugins.plugins['miro-canvas'].backlinks.refresh();b.backlinkDom.onResize();b.backlinkDom.changed.run();b.backlinkDom.infinityScroll.compute();return {file:v.file?.path,rect:v.containerEl.getBoundingClientRect().toJSON(),count:b.backlinkCountEl.textContent,text:v.containerEl.textContent,propertyRows:[...v.containerEl.querySelectorAll('[data-miro-canvas-property]')].map(e=>e.textContent),html:v.containerEl.innerHTML.slice(-1500)};`);
    assert.equal(backlink.file,'Feature Reference.md','backlink pane source must be the prepared note');
    assert.ok(Number(backlink.count)>0,JSON.stringify(backlink));
    assert.ok(backlink.text.includes('Launch card'),JSON.stringify(backlink));
    receipt.checks.push({name:'native backlinks count and visible card excerpts',count:backlink.count,text:backlink.text});
    // Hidden Chromium does not acknowledge wheel compositor input. Scroll only
    // this test pane through its native viewport, recorded as preparation.
    await checked(`const v=app.workspace.getLeavesOfType('backlink').find(l=>l.id===${JSON.stringify(backlinkLeafId)}).view,d=v.backlink.backlinkDom;d.infinityScroll.scrollEl.scrollTop=d.infinityScroll.scrollEl.scrollHeight;d.infinityScroll.onScroll();return true;`);await wait(300);
    const bottom=await checked(`const v=app.workspace.getLeavesOfType('backlink').find(l=>l.id===${JSON.stringify(backlinkLeafId)}).view,d=v.backlink.backlinkDom;d.infinityScroll.compute();return {text:v.containerEl.textContent,rows:[...v.containerEl.querySelectorAll('[data-miro-canvas-property-key]')].map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON()}))};`);
    assert.ok(bottom.text.includes(propertyPath),JSON.stringify(bottom));assert.ok(bottom.rows.some(r=>r.text.includes('Feature Reference')&&r.rect.width>0));
    receipt.checks.push({name:'scroll to native property-only backlink rows',bottom});
    receipt.checks.push({name:'native backlinks counts/excerpts and property-only source rows',count:backlink.count,text:backlink.text});
    await checked(`const leaf=app.workspace.getLeaf(false);await leaf.setViewState({type:'graph'});app.workspace.setActiveLeaf(leaf,{focus:false});return true;`);await wait(1300);
    const graph=await checked(`const v=app.workspace.activeLeaf.view;return {keys:Object.keys(v.renderer),nodes:Array.isArray(v.renderer.nodes)?v.renderer.nodes.map(n=>n.id):Object.keys(v.renderer.nodes??{}),first:v.renderer.nodes?.[0]?Object.keys(v.renderer.nodes[0]):[],data:typeof v.getData==='function'?v.getData():undefined};`);
    receipt.checks.push({name:'native graph model',graph});
    assert.ok(graph.nodes.includes(boardPath),JSON.stringify(graph));receipt.checks.push({name:'native graph contains linked Canvas',nodes:graph.nodes.length});
  } else if (phase === 'presentation') {
    await checked(`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({contentTextThreshold:.8});app.workspace.activeLeaf.view.canvas.setViewport(430,255,-1);return true;`);await select([]);
    assert.equal(await checked(`return getComputedStyle(app.workspace.activeLeaf.view.canvas.nodes.get('a').contentEl).visibility;`),'hidden');
    await select(['a']);
    assert.equal(await checked(`return getComputedStyle(app.workspace.activeLeaf.view.canvas.nodes.get('a').contentEl).visibility;`),'visible');
    await command('custom-styles');
    await tap('.miro-canvas-custom-style-editor__form input');await client.send('Input.insertText',{text:'Acceptance style'});
    await tap('.miro-canvas-custom-style-editor__declarations');await client.send('Input.insertText',{text:'border-color: #2468ac; color: #2468ac; opacity: 0.7;'});
    await tap('.miro-canvas-custom-style-editor__form button[type="submit"]');await wait(350);
    const definitions=await checked(`return app.plugins.plugins['miro-canvas'].canvasSettings.customStyles;`);
    assert.ok(definitions.some(d=>d.name==='Acceptance style'),JSON.stringify(definitions));
    await key('Escape','Escape');await select(['a']);
    await tap('.miro-canvas-toolbar__button--more');
    const actionLabel=await checked(`return localStorage.language==='ru'?'Действия с доской':'Board actions';`);
    await tap('.miro-canvas-toolbar button',actionLabel);await tap('.menu-item','Acceptance style');
    const paint=await checked(`const c=app.workspace.activeLeaf.view.canvas,n=c.nodes.get('a');n.render();await Promise.resolve();return {opacity:getComputedStyle(n.nodeEl).opacity,color:getComputedStyle(n.contentEl).color,border:getComputedStyle(n.containerEl).borderColor,override:c.getData().miroCanvas.localOverrides.a};`);
    assert.equal(paint.opacity,'0.7');assert.equal(paint.color,'rgb(36, 104, 172)');assert.ok(paint.override.customStyles?.length);
    receipt.checks.push({name:'zoom hiding exempts selection; native style editor/menu assigns persistent CSS',paint});
    await key('z','KeyZ',2);
    assert.equal(await checked(`return app.workspace.activeLeaf.view.canvas.getData().miroCanvas.localOverrides?.a?.customStyles?.length??0;`),0);
  } else if (phase === 'palette') {
    await command('permanent-palette');
    await tap('.miro-canvas-palette-editor__form label:first-of-type input');
    await client.send('Input.insertText',{text:'Acceptance color'});
    await tap('.miro-canvas-palette-editor__form label:nth-of-type(2) input');
    await client.send('Input.insertText',{text:'#2468ac'});
    await tap('.miro-canvas-palette-editor__form button[type="submit"]');await wait(400);
    const saved=await checked(`const p=app.plugins.plugins['miro-canvas'];return {memory:p.canvasSettings.permanentPalette,disk:(await p.loadData()).permanentPalette};`);
    receipt.checks.push({name:'palette input/save state',saved,form:await checked(`return {active:document.activeElement?.outerHTML,fields:[...document.querySelectorAll('.miro-canvas-palette-editor__form input')].map(e=>({value:e.value,rect:e.getBoundingClientRect().toJSON()})),status:document.querySelector('.miro-canvas-palette-editor__status')?.textContent};`)});
    assert.ok(saved.memory?.some(c=>c.label==='Acceptance color'&&c.color==='#2468ac'),JSON.stringify(receipt.checks));
    assert.deepEqual(saved.memory,saved.disk);
    await key('Escape','Escape');
    receipt.checks.push({name:'palette form saves global color to settings',count:saved.memory.length});
    const local=[{id:'board-only',label:'Board only',color:'#aa3377',source:'custom'}];
    const retained=await checked(`const p=app.plugins.plugins['miro-canvas'],s=p.m1Session,b=s.actionSnapshot(),next=structuredClone(b);
      next.miroCanvas.settings={...(next.miroCanvas.settings??{}),palette:${JSON.stringify(local)}};if(!s.applyFeatureDocument(next,b))throw Error('local palette preparation failed');
      await p.saveCanvasSettings({permanentPalette:${JSON.stringify(saved.memory)}});return {displayed:p.m1Session.appearance.settings.palette,stored:p.m1Session.view.canvas.getData().miroCanvas.settings.palette};`);
    assert.deepEqual(retained.displayed,local);assert.deepEqual(retained.stored,local);
    receipt.checks.push({name:'global preference preserves prepared individual palette',retained});
  }
  receipt.passed=true;
  console.log(JSON.stringify({phase,device:receipt.device,checks:receipt.checks.map(c=>c.name),passed:true}));
} finally {
  if(prior?.path)await checked(`const p=app.plugins.plugins['miro-canvas'];p.m1Session?.resetTools();for(const modal of p.enhancementModals)modal.close();
    if(${phase === 'palette' || phase === 'presentation'})await p.saveCanvasSettings(${JSON.stringify(prior.settings)});
    const f=app.vault.getAbstractFileByPath(${JSON.stringify(prior.path)});if(f)await app.workspace.getLeaf(false).openFile(f,{active:true});return true;`).catch(error=>{receipt.restoreError=String(error);});
  writeFileSync(new URL(`native-${phase}-${serial??'Windows'}.json`,out),JSON.stringify(receipt,null,2));
  if(!serial)await client.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  client.close();
}
