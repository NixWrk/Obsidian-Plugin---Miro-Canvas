// Installed native PDF/lifecycle checks. Forced failures/retry are instrumentation.
// Windows stays hidden; Android input matrices run separately with ADB.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { connectByTitle, evaluate } from './cdp.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const serial = option('--serial');
const port = Number(option('--port', '9346'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const probe = await build({ stdin: { contents: "export { applyNativePdfFit, createObsidianDocumentHost } from './src/obsidian-document-host'; export { describeLocalDocument } from './src/document-viewer';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: '__timerOwnerProbe', platform: 'browser' });
const baselineSource = execFileSync('git', ['show', '85cb6cd:src/obsidian-document-host.ts'], { encoding: 'utf8', windowsHide: true });
const baseline = await build({ stdin: { contents: baselineSource, resolveDir: process.cwd() + '/src', loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: '__timerOwnerBaseline', platform: 'browser' });
const { send, close } = await connectByTitle(port, serial ? 'Obsidian' : undefined);
async function checked(code) {
    let timer;
    try {
        const value = await Promise.race([evaluate(send, `const base=app.vault.adapter.getBasePath?.().split(String.fromCharCode(92)).join('/');if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!base?.includes('/tools/obsidian_cdp/.out/'))throw Error('isolated test vault required');` + code), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Obsidian suspended')), 15000); })]);
        if (value?.error) throw Error(value.error);
        return value;
    } finally { clearTimeout(timer); }
}
let saved;
const result = { device: serial ?? 'Windows', input: 'CDP native API calls and explicitly forced probes; ADB input in separate matrices', passed: false };
try {
    if (!serial) await checked("const w=require('@electron/remote').getCurrentWindow();w.webContents.setBackgroundThrottling(false);w.hide();return !w.isVisible();");
    saved = await checked("const f=app.workspace.getActiveFile();return {path:f.path,text:await app.vault.read(f)};");
    await checked(`${probe.outputFiles[0].text};${baseline.outputFiles[0].text};window.__timerOwnerProbe=__timerOwnerProbe;window.__timerOwnerBaseline=__timerOwnerBaseline;return true;`);
    result.lifecycle = await checked(`
        const p=app.plugins.plugins['miro-canvas'],leaf=app.workspace.activeLeaf;
        if(p.initializationTimerHost!==window)throw Error('plugin timer host');
        const events=[],handles=new Set(),host=p.initializationTimerHost;
        const set=host.setTimeout,clear=host.clearTimeout;
        const prototype=p.m1Session.constructor.prototype, mount=prototype.mount;
        const file=app.workspace.getActiveFile(),before=await app.vault.read(file);
        let block=false;
        host.setTimeout=function(callback,delay,...rest){const h=Reflect.apply(set,this,[callback,delay,...rest]);if(delay===250){events.push({kind:'set',sameOwner:this===host,delay});handles.add(h);}return h;};
        host.clearTimeout=function(handle){if(handles.has(handle)){events.push({kind:'clear',sameOwner:this===host});handles.delete(handle);}return Reflect.apply(clear,this,[handle]);};
        prototype.mount=function(...rest){const ready=Reflect.apply(mount,this,rest);return block?false:ready;};
        try {
            block=true;p.handleActiveLeafChange(leaf);if(p.initializationRetry===null)throw Error('forced retry absent');
            block=false;await new Promise(r=>Reflect.apply(set,host,[r,350]));
            if(p.initializationRetry!==null||!p.m1Session?.root||p.metadataWriter===null)throw Error('ready retry did not settle');
            block=true;p.handleActiveLeafChange(leaf);const pending=p.initializationRetry;
            if(pending===null)throw Error('switch retry absent');
            const other=app.workspace.getLeaf('tab');await other.openFile(file,{active:true});
            if(handles.has(pending))throw Error('switch did not clear original timer');
            other.detach();app.workspace.setActiveLeaf(leaf,{focus:false});
            p.handleActiveLeafChange(leaf);const unload=p.initializationRetry;
            if(unload===null)throw Error('unload retry absent');
            await app.plugins.disablePlugin('miro-canvas');
            if(handles.has(unload)||p.initializationRetry!==null)throw Error('unload did not clear timer');
            block=false;await app.plugins.enablePlugin('miro-canvas');
            await new Promise(r=>Reflect.apply(set,host,[r,500]));
            if(!app.plugins.plugins['miro-canvas']?.m1Session?.root)throw Error('reload not mounted');
            if(await app.vault.read(file)!==before)throw Error('lifecycle wrote board');
            if(!events.every(e=>e.sameOwner))throw Error('timer receiver mismatch');
            return {events,forcedMountFailure:true,retryReady:true,switchCancels:true,unloadCancels:true,reload:true,byteUnchanged:true};
        } finally {
            prototype.mount=mount;host.setTimeout=set;host.clearTimeout=clear;
            if(!app.plugins.plugins['miro-canvas'])await app.plugins.enablePlugin('miro-canvas');
            app.workspace.setActiveLeaf(leaf,{focus:false});
        }
    `);
    await wait(500);
    result.pdf = await checked(`
        const probe=window.__timerOwnerProbe,original=app.workspace.activeLeaf;
        const file=app.vault.getFiles().filter(f=>f.extension==='pdf').sort((a,b)=>b.stat.mtime-a.stat.mtime)[0];
        if(!file)throw Error('run visibility export first');
        const existing=app.workspace.getLeavesOfType('pdf');
        const diagnostics=[],host=probe.createObsidianDocumentHost(app,m=>diagnostics.push(m),f=>!!f&&f.extension!==undefined);
        let pdfLeaf;
        try {
            await host.openFile(probe.describeLocalDocument(file.path,{fit:'width',page:1}));
            pdfLeaf=app.workspace.getLeavesOfType('pdf').find(l=>l.view.file===file);
            if(!pdfLeaf)throw Error('actual PDF tab missing');
            const view=pdfLeaf.view,owner=view.containerEl.ownerDocument.defaultView;
            const renderer=await view.viewer,pdf=renderer?.pdfViewer?.pdfViewer;
            const width=pdf?.currentScaleValue;
            let baselineFit=null,baselineError=null;
            try { baselineFit=await window.__timerOwnerBaseline.applyNativePdfFit(view,probe.describeLocalDocument(file.path,{fit:'width'})); }
            catch(error) { baselineError=String(error); }
            const currentFit=await probe.applyNativePdfFit(view,probe.describeLocalDocument(file.path,{fit:'width'}));
            await host.openFile(probe.describeLocalDocument(file.path,{fit:'page',page:1}));
            const page=pdf?.currentScaleValue;
            if(width!=='page-width')throw Error('native width fit mismatch');
            if(page!=='page-fit')throw Error('native page fit mismatch');
            if(currentFit!==true)throw Error('current native fit failed');
            if(diagnostics.length!==0)throw Error('native PDF diagnostics must be empty');
            const events=[],handles=new Set(),set=owner.setTimeout,clear=owner.clearTimeout;
            owner.setTimeout=function(callback,delay,...rest){const h=Reflect.apply(set,this,[callback,delay,...rest]);if(delay===2000){events.push({kind:'set',sameOwner:this===owner,delay});handles.add(h);}return h;};
            owner.clearTimeout=function(h){if(handles.has(h)){events.push({kind:'clear',sameOwner:this===owner});handles.delete(h);}return Reflect.apply(clear,this,[h]);};
            let reject,resolve;
            try {
                const never=new Promise(r=>{resolve=r;});
                const start=performance.now();
                if(await probe.applyNativePdfFit({containerEl:view.containerEl,viewer:never},probe.describeLocalDocument(file.path))!==false)throw Error('never-ready result');
                const elapsed=performance.now()-start;if(elapsed<1950||elapsed>5000)throw Error('native owner deadline');
                const rejected=new Promise((_,r)=>{reject=r;});
                const task=probe.applyNativePdfFit({containerEl:view.containerEl,viewer:rejected},probe.describeLocalDocument(file.path));reject(Error('forced PDF failure'));
                if(await task!==false)throw Error('rejected result');
                if(handles.size||!events.every(e=>e.sameOwner))throw Error('native owner cleanup');
                let lateWrites=0,lateScale='auto';
                const latePdf={pdfDocument:{},firstPagePromise:Promise.resolve(),pagesPromise:Promise.resolve(),get currentScaleValue(){return lateScale;},set currentScaleValue(value){lateWrites++;lateScale=value;}};
                const lateRenderer={pdfViewer:{pdfViewer:latePdf,initializedPromise:Promise.resolve(),isInitialViewSet:true}};
                resolve(lateRenderer);await new Promise(r=>Reflect.apply(set,owner,[r,50]));
                if(lateWrites!==0)throw Error('late ready wrote fit');
                if(await probe.applyNativePdfFit({containerEl:view.containerEl,viewer:Promise.resolve(lateRenderer)},probe.describeLocalDocument(file.path))!==true||lateWrites!==1||lateScale!=='page-fit')throw Error('loaded facade active fit control failed');
                if(handles.size||!events.every(e=>e.sameOwner))throw Error('loaded facade owner cleanup');
                return {path:file.path,actualNativeView:true,ownerIsMain:owner===window,width,page,diagnostics,baselineFit,baselineError,baselineInformationalOnly:true,baselineNote:'85cb6cd early readiness reads can race native initialization; no compatibility or absent-capability verdict',currentFit,forcedNeverReady:true,forcedRejection:true,elapsed,lateReadyIgnored:true,lateRendererInstrumented:true,loadedFacadeActiveFit:true,events};
            } finally { owner.setTimeout=set;owner.clearTimeout=clear; }
        } finally {
            if(pdfLeaf&&!existing.includes(pdfLeaf))pdfLeaf.detach();
            app.workspace.setActiveLeaf(original,{focus:false});
        }
    `);
    assert.equal(await checked(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(saved.path)});return await app.vault.read(f)===${JSON.stringify(saved.text)};`), true);
    if (!serial) assert.equal(await checked("return !require('@electron/remote').getCurrentWindow().isVisible();"), true);
    result.originalByteUnchanged = true;
    result.popout = 'pending; hidden native popout and owner-closure verification belong to the separate parent probe';
    result.passed = true;
} finally {
    await checked('delete window.__timerOwnerProbe;delete window.__timerOwnerBaseline;return true;').catch(() => {});
    writeFileSync(new URL(`./.out/timer-owners-${serial ?? 'Windows'}.json`, import.meta.url), JSON.stringify(result, null, 2));
    close();
}
console.log(`OK ${serial ?? 'Windows'} native timer ownership, lifecycle and PDF; forced branches recorded separately`);
