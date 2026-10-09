// Real native controls and isolated exports; no screenshots or window activation.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { connectByTitle, evaluate } from './cdp.mjs';
import { captureNativeSdk } from './native-sdk.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option('--port', '9346'));
const serial = option('--serial');
const client = await connectByTitle(port, serial ? 'Obsidian' : undefined);
const run = promisify(execFile);
const adb = 'C:/Program Files/VirtualTablet Server/adb/adb.exe';
const out = new URL('./.out/card-appearance/', import.meta.url);
mkdirSync(out, { recursive: true });
const receipt = { device: serial ?? 'Windows', checks: [], passed: false };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function checked(code) {
  let timeout;
  try {
    const result = await Promise.race([evaluate(client.send, `
      if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!app.vault.adapter.basePath.includes('/l20-windows/vault')&&!app.vault.adapter.basePath.includes('\\\\l20-windows\\\\vault'))throw Error('test vault required');
      if(!app.isMobile){const w=require('@electron/remote').getCurrentWindow();if(w.isVisible()||w.isFocused())throw Error('hidden window required');}
      ${code}`), new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('native check suspended')), 60000); })]);
    if (result?.error) throw Error(result.error);
    return result;
  } finally { clearTimeout(timeout); }
}
async function tap(selector) {
  const point = await checked(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width>0);if(!e)throw Error('missing control');const r=e.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw Error('obscured control');return {...p,dpr:devicePixelRatio};`);
  if (serial) {
    const focus = await run(adb, ['-s', serial, 'shell', 'dumpsys window'], { windowsHide: true, timeout: 12000, maxBuffer: 8 * 1024 * 1024 });
    assert.ok(focus.stdout.split('\n').find(line => line.includes('mCurrentFocus='))?.includes('md.obsidian/'));
    await run(adb, ['-s', serial, 'shell', `input tap ${Math.round(point.x * point.dpr)} ${Math.round(point.y * point.dpr)}`], { windowsHide: true, timeout: 12000 });
  } else {
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
  }
  await wait(350);
}
async function settle() {
  await wait(400);
  if (serial) { await checked("app.workspace.activeLeaf.view.canvas?.setViewport(450,250,0);return true;"); await wait(300); return; }
  await checked(`const s=app.plugins.plugins['miro-canvas'].m1Session,c=s?.view.canvas;if(!c)return false;const raf=window.requestAnimationFrame,shot=c.screenshotting,pending=[];c.cancelFrame();try{c.screenshotting=true;c.x=c.tx=450;c.y=c.ty=250;c.zoom=c.tZoom=0;c.scale=1;c.viewportChanged=true;window.requestAnimationFrame=f=>{pending.push(f);return 1;};c.virtualize();for(const n of c.nodes.values()){n.render();n.mountContent?.();}c.finishViewportAnimation=true;c.requestFrame(performance.now()-1000);for(let i=0;i<16&&pending.length;i++)pending.shift()(performance.now());for(const n of c.nodes.values()){const r=n.child?.previewMode?.renderer;if(r&&r.lastText!==r.text){r.queued?.cancel();r.onResize();r.onRender();}}const noteRenderer=window.cardAppearancePrior?.noteLeaf?.view?.previewMode?.renderer;if(noteRenderer){noteRenderer.queued?.cancel();noteRenderer.onResize();noteRenderer.onRender();}}finally{c.screenshotting=shot;window.requestAnimationFrame=raf;c.cancelFrame();}s.refresh();return true;`);
}
async function mountControl(name) {
  return checked(`const tab=app.setting.pluginTabs.find(t=>t.id==='miro-canvas'),entries=[];const visit=items=>{for(const item of items){if(item.items)visit(item.items);else entries.push(item);}};visit(tab.getSettingDefinitions());const row=entries.find(e=>${name === 'radius' ? '/Card corner radius|Радиус скругления карточек/.test(e.name)' : "e.name==='miro-canvas-acceptance-indent'"});if(!row)throw Error('native definition missing');const host=document.createElement('div');host.id='card-appearance-native-control';host.className='miro-canvas-settings';Object.assign(host.style,{position:'fixed',top:'70px',left:'16px',right:'16px',background:'var(--background-primary)',padding:'20px',zIndex:'99999'});document.body.appendChild(host);app.keymap.pushScope(app.setting.scope);window.cardAppearancePrior.controlScope=true;const setting=new window.__l20NativeSdk.Setting(host).setName(row.name).setDesc(row.desc??'');row.render(setting);return {name:row.name,definitionsIndexed:true};`);
}
try {
  if (!serial) {
    await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    receipt.focusPreparation = 'CDP renderer focus emulation; native window remains hidden and unfocused';
  }
  receipt.sdk = await captureNativeSdk(client.send);
  await checked(`window.cardAppearancePrior={path:app.workspace.getActiveFile()?.path,settings:structuredClone(app.plugins.plugins['miro-canvas'].canvasSettings),enabled:[...app.customCss.enabledSnippets]};if(!app.isMobile)require('@electron/remote').getCurrentWindow().webContents.setBackgroundThrottling(false);return true;`);
  receipt.fixture = await checked(readFileSync(new URL('./canvas-enhancement-fixture.js', import.meta.url), 'utf8'));
  receipt.runtime = await checked(`return {vault:app.vault.getName(),mobile:app.isMobile,version:app.plugins.plugins['miro-canvas'].manifest.version,userAgent:navigator.userAgent};`);
  await checked(`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({cardCornerRadius:0,allowedCanvasSnippets:[]});return true;`);
  await settle();
  const square = await checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('a');return {marker:n.nodeEl.getAttribute('data-miro-canvas-card-corners'),radius:getComputedStyle(n.nodeEl.querySelector('.canvas-node-container')).borderTopLeftRadius};`);
  assert.equal(square.marker, 'true');
  assert.equal(square.radius, '0px');
  receipt.checks.push({ name: 'square native text card', square });
  receipt.radiusControl = await mountControl('radius');
  await tap('#card-appearance-native-control input[type="range"]');
  if (!serial) {
    await checked(`const input=document.querySelector('#card-appearance-native-control .miro-canvas-card-radius-value');input.focus();input.select();return true;`);
    await client.send('Input.insertText', { text: '20' });
    await wait(350);
  }
  await checked(`document.querySelector('#card-appearance-native-control')?.remove();if(window.cardAppearancePrior?.controlScope){app.keymap.popScope(app.setting.scope);window.cardAppearancePrior.controlScope=false;}return true;`);
  await settle();
  const rounded = await checked(`const c=app.workspace.activeLeaf.view.canvas;return {value:app.plugins.plugins['miro-canvas'].canvasSettings.cardCornerRadius,radius:getComputedStyle(c.nodes.get('a').nodeEl.querySelector('.canvas-node-container')).borderTopLeftRadius,groupMarker:c.nodes.get('group').nodeEl.getAttribute('data-miro-canvas-card-corners')};`);
  assert.ok(rounded.value > 0 && rounded.value <= 48);
  assert.equal(rounded.radius, `${rounded.value}px`);
  assert.equal(rounded.groupMarker, null);
  receipt.checks.push({ name: 'adjustable card radius, group unchanged', rounded });
  receipt.note = await checked(`const source=app.workspace.activeLeaf,f=await app.vault.create('Card appearance note '+Date.now()+'.md','Ordinary note paragraph'),leaf=app.workspace.getLeaf('split');await leaf.setViewState({type:'markdown',state:{file:f.path,mode:'preview'},active:true});window.cardAppearancePrior.noteLeaf=leaf;await new Promise(r=>setTimeout(r,350));const renderer=leaf.view.previewMode?.renderer;if(renderer){renderer.queued?.cancel();renderer.onResize();renderer.onRender();}app.workspace.setActiveLeaf(source,{focus:false});return {path:f.path,leaf:leaf.id};`);
  await settle();
  // Native snippet installation/enabling is fixture preparation, not a user preference mutation.
  receipt.snippet = await checked(`const name='miro-canvas-acceptance-indent',path=app.vault.configDir+'/snippets/'+name+'.css';if(await app.vault.adapter.exists(path))throw Error('acceptance snippet already exists');const dir=app.vault.configDir+'/snippets';if(!await app.vault.adapter.exists(dir))await app.vault.adapter.mkdir(dir);const css='body {text-indent:31px;--canvas-acceptance-variable:31px;} .markdown-preview-view p {text-indent:47px !important;} .markdown-source-view .cm-line {text-indent:47px !important;}';await app.vault.adapter.write(path,css);await app.customCss.readSnippets();app.customCss.setCssEnabledStatus(name,true);await app.customCss.loadSnippets();window.cardAppearancePrior.snippetPath=path;return {name,path};`);
  await settle();
  const inspectIndent = () => checked(`const n=app.workspace.activeLeaf.view.canvas.nodes.get('a'),p=n.nodeEl.querySelector('p');if(!p)throw Error('text not materialized '+JSON.stringify({initialized:n.initialized,mounted:n.isContentMounted,attached:n.isAttached,child:Object.keys(n.child??{}),content:n.contentEl?.outerHTML?.slice(0,900),preview:n.child?.previewMode?.renderer?{text:n.child.previewMode.renderer.text,last:n.child.previewMode.renderer.lastText,queue:!!n.child.previewMode.renderer.queued,offset:n.child.previewMode.renderer.previewEl.offsetWidth,parent:!!n.child.previewMode.renderer.previewEl.offsetParent}:null,direct:n.child?.renderer?{text:n.child.renderer.text,last:n.child.renderer.lastText,queue:!!n.child.renderer.queued,offset:n.child.renderer.previewEl.offsetWidth,parent:!!n.child.renderer.previewEl.offsetParent}:null}));const note=window.cardAppearancePrior.noteLeaf.view.containerEl.querySelector('.markdown-preview-view p');if(!note)throw Error('native note text not materialized');const normal=getComputedStyle(note).textIndent,card=getComputedStyle(p).textIndent,variable=getComputedStyle(p).getPropertyValue('--canvas-acceptance-variable');return {normal,card,variable,allowed:app.plugins.plugins['miro-canvas'].canvasSettings.allowedCanvasSnippets,snippets:[...app.customCss.enabledSnippets]};`);
  const blocked = await inspectIndent();
  receipt.blocked = blocked;
  receipt.snippetRuntime = await checked(`return {names:app.customCss.snippets,enabled:[...app.customCss.enabledSnippets],disabled:app.customCss.disabled,sheets:app.customCss.extraStyleEls.map(e=>({text:e.textContent,disabled:e.sheet?.disabled,rules:[...e.sheet.cssRules].map(r=>r.cssText)})),scopes:[...document.querySelectorAll('[data-miro-canvas-snippet-scope]')].map(e=>({class:e.className,style:e.style.cssText}))};`);
  assert.equal(blocked.normal, '47px');
  assert.equal(blocked.card, '0px');
  assert.equal(blocked.variable.trim(), '');
  receipt.checks.push({ name: 'snippet excluded including important and inherited variables; note unchanged', blocked });
  receipt.snippetControl = await mountControl('snippet');
  await tap('#card-appearance-native-control .checkbox-container');
  if (!serial && !await checked(`return app.plugins.plugins['miro-canvas'].canvasSettings.allowedCanvasSnippets.includes('miro-canvas-acceptance-indent');`)) {
    receipt.snippetKeyboard = await checked(`const e=document.querySelector('#card-appearance-native-control .checkbox-container');e.focus();return {tag:e.tagName,role:e.getAttribute('role'),focused:document.activeElement===e};`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await wait(350);
  }
  await checked(`document.querySelector('#card-appearance-native-control')?.remove();if(window.cardAppearancePrior?.controlScope){app.keymap.popScope(app.setting.scope);window.cardAppearancePrior.controlScope=false;}return true;`);
  await settle();
  const allowed = await inspectIndent();
  receipt.allowed = allowed;
  assert.equal(allowed.card, '47px');
  assert.equal(allowed.variable.trim(), '31px');
  receipt.checks.push({ name: 'individual snippet opt-in', allowed });
  await checked(`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({allowedCanvasSnippets:[]});return true;`);
  await wait(300);
  if (!serial) await checked(`require('@electron/remote').getCurrentWindow().webContents.setBackgroundThrottling(true);return true;`);
  receipt.export = await checked(`const p=app.plugins.plugins['miro-canvas'],s=p.m1Session,c=s.view.canvas,f=app.workspace.getActiveFile(),before=await app.vault.read(f),read=()=>({x:c.x,y:c.y,tx:c.tx,ty:c.ty,zoom:c.zoom,tZoom:c.tZoom,selection:[...c.selection].map(n=>n.id),classes:c.wrapperEl.className,screenshotting:Boolean(c.screenshotting)}),baseline=read(),samples=[],notices=[],backgroundTransforms=[],generated=[];const old=s.exporting,notice=s.options.onNotice;let saved;const save=s.options.onSaveExport;const timer=setInterval(()=>{samples.push(read());if(backgroundTransforms.length===0){const host=document.querySelector('.miro-canvas-export-renderer');if(host){if(generated.length===0){for(const e of host.querySelectorAll('*')){if(e.closest('svg'))continue;for(const pseudo of ['::before','::after']){const st=getComputedStyle(e,pseudo);if(st.content&&st.content!=='none'&&st.content!=='normal')generated.push({tag:e.tagName,class:e.className,pseudo,content:st.content,display:st.display,width:st.width,height:st.height,color:st.color,background:st.backgroundColor});}}}const entries=[...host.querySelectorAll('svg,svg *')].map(e=>({tag:e.tagName,class:e.getAttribute('class'),attr:e.getAttribute('transform'),css:getComputedStyle(e).transform,origin:getComputedStyle(e).transformOrigin,box:getComputedStyle(e).transformBox,ctm:e.getCTM?.()?.toString(),html:e.outerHTML.slice(0,300)})).filter(e=>e.css&&e.css!=='none'&&!e.attr);if(entries.length)backgroundTransforms.push(...entries);}}},10);s.options.onNotice=m=>notices.push(m);s.options.onSaveExport=async(name,bytes,path)=>{const text=new TextDecoder().decode(bytes),xml=new DOMParser().parseFromString(text,'image/svg+xml');if(xml.querySelector('parsererror'))throw Error('invalid SVG XML');saved={name,size:bytes.length,text:xml.documentElement.textContent,paths:xml.querySelectorAll('path').length,texts:xml.querySelectorAll('text').length,images:xml.querySelectorAll('image').length,foreign:xml.querySelectorAll('foreignObject').length,radii:[...xml.querySelectorAll('rect[rx]')].map(e=>e.getAttribute('rx')),source:path};const savedPath=await save(name,bytes,path);saved.path=savedPath;return savedPath;};try{s.exporting={mode:'board',title:'Vector acceptance',state:{format:'free',orientation:'landscape',quality:'standard',pages:[{id:'page',x:0,y:0,width:1400,height:700}]},panel:{update(){},element:document.createElement('div')},overlay:{update(){}},stop:false};await s.runExport('svg');samples.push(read());return {saved,notices,generated,backgroundTransforms,baseline,samples,sourceUnchanged:await app.vault.read(f)===before,workers:p.exportJobs.size,surfaces:document.querySelectorAll('.miro-canvas-export-renderer').length};}finally{clearInterval(timer);s.exporting=old;s.options.onSaveExport=save;s.options.onNotice=notice;}`);
  assert.ok(receipt.export.saved, JSON.stringify(receipt.export.notices));
  assert.ok(receipt.export.saved.name.endsWith('.svg'));
  assert.ok(receipt.export.saved.paths > 0 && receipt.export.saved.texts > 0);
  assert.ok(receipt.export.saved.text.includes('Launch card') && receipt.export.saved.text.includes('Outside'));
  assert.equal(receipt.export.saved.foreign, 0);
  assert.equal(receipt.export.saved.images, 0);
  assert.ok(receipt.export.saved.radii.includes(String(rounded.value)));
  assert.equal(receipt.export.sourceUnchanged, true);
  assert.equal(receipt.export.workers, 0);
  assert.equal(receipt.export.surfaces, 0);
  for (const sample of receipt.export.samples) assert.deepEqual(sample, receipt.export.baseline);
  receipt.passed = true;
} catch (error) {
  receipt.error = error.stack ?? String(error);
  throw error;
} finally {
  try {
    receipt.restore = await checked(`document.querySelector('#card-appearance-native-control')?.remove();if(window.cardAppearancePrior?.controlScope){app.keymap.popScope(app.setting.scope);window.cardAppearancePrior.controlScope=false;}const prior=window.cardAppearancePrior;if(!prior)return false;const p=app.plugins.plugins['miro-canvas'];await p.saveCanvasSettings(prior.settings);if(prior.snippetPath){app.customCss.setCssEnabledStatus('miro-canvas-acceptance-indent',false);await app.vault.adapter.remove(prior.snippetPath);await app.customCss.readSnippets();await app.customCss.loadSnippets();}prior.noteLeaf?.detach();const f=app.vault.getAbstractFileByPath(prior.path);if(f)await app.workspace.getLeaf(false).openFile(f,{active:true});if(!app.isMobile)require('@electron/remote').getCurrentWindow().webContents.setBackgroundThrottling(true);delete window.cardAppearancePrior;return true;`);
  } finally {
    writeFileSync(new URL(`native-${serial ?? 'Windows'}.json`, out), JSON.stringify(receipt, null, 2));
    if (!serial) await client.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    client.close();
  }
}
console.log(JSON.stringify({ device: receipt.device, passed: receipt.passed, checks: receipt.checks.map(check => check.name), svg: receipt.export?.saved?.size }));
