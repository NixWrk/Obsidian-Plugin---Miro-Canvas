// No screenshots, window activation or Android input: observe a background job.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { connectByTitle, evaluate } from './cdp.mjs';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option('--port', '9346'));
const label = option('--label', 'Windows');
const expectedText = option('--expect-text', '').split('|').filter(Boolean);
const out = option('--out', new URL(`.out/independent-export-${label}.json`, import.meta.url));
const client = await connectByTitle(port, port === 9346 ? undefined : 'Obsidian');
let timer;
try {
  const result = await Promise.race([evaluate(client.send, `
    if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!app.vault.adapter.getBasePath().includes('l20-windows'))throw Error('test vault required');
    if(!app.isMobile){const w=require('@electron/remote').getCurrentWindow();if(w.isVisible()||w.isFocused())throw Error('hidden window required');}
    const p=app.plugins.plugins['miro-canvas'],s=p.m1Session,leaf=app.workspace.activeLeaf,c=leaf.view.canvas;
    if(s.exporting?.busy||p.exportJobs.size!==0)throw Error('another export is running');
    const original=s.exporting,save=s.options.onSaveExport,notice=s.options.onNotice,WorkerCtor=window.Worker;
    const f=app.workspace.getActiveFile(),text=await app.vault.read(f);
    const read=()=>({path:app.workspace.getActiveFile()?.path,x:c.x,y:c.y,tx:c.tx,ty:c.ty,zoom:c.zoom,tZoom:c.tZoom,selection:[...c.selection].map(n=>n.id),screenshotting:Boolean(c.screenshotting),classes:c.wrapperEl.className});
    const baseline=read(),samples=[],notices=[],outputs=[],workers=[],backgroundSamples=[],nativeTextSamples=[],backgroundCanvases=[];
    const factories=app.viewRegistry.viewByType,nativeFactory=factories.canvas;
    const captureFactory=function(leaf){const view=Reflect.apply(nativeFactory,this,[leaf]);if(leaf.containerEl.closest('.miro-canvas-export-renderer'))backgroundCanvases.push(view.canvas);return view;};
    factories.canvas=captureFactory;
    const sample=()=>{samples.push(read());const host=document.querySelector('.miro-canvas-export-renderer');if(host&&backgroundSamples.length<16){const text=[...host.querySelectorAll('.canvas-node-content')].slice(0,10).map(e=>e.textContent.slice(0,256)).join('|'),job=backgroundCanvases.length-1;if(text&&(backgroundSamples.at(-1)?.text!==text||backgroundSamples.at(-1)?.job!==job))backgroundSamples.push({job,nodes:host.querySelectorAll('.canvas-node').length,text});}
      if(nativeTextSamples.length<2)for(const canvas of backgroundCanvases){const node=[...canvas.nodes.values()].find(n=>n.text&&n.initialized&&n.child);if(!node)continue;const child=node.child,r=child.previewMode?.renderer;nativeTextSamples.push({id:node.id,text:node.text,initialized:node.initialized,mounted:node.isContentMounted,nodeText:node.nodeEl.textContent,contentText:node.contentEl?.textContent,childKeys:Object.keys(child),renderer:r?{keys:Object.keys(r),text:r.text,lastText:r.lastText,parsing:r.parsing,queued:!!r.queued,high:r.queued?.high,sections:r.sections.map(s=>({rendered:s.rendered,computed:s.computed,text:s.el.textContent})),async:r.asyncSections.length,set:String(r.set),onRender:String(r.onRender),queueRender:String(r.queueRender),onResize:String(r.onResize)}:undefined});break;}};
    const interval=setInterval(sample,25);
    const root=document.createElement('div'),overlay=document.createElement('div');
    const node=[...c.nodes.values()][0]?.getData();
    if(!node)throw Error('nonempty test board required');
    const state={format:'free',orientation:'landscape',quality:'standard',pages:[{id:'independent',name:'Independent page',x:node.x-30,y:node.y-30,width:Math.max(node.width+60,700),height:Math.max(node.height+60,500)}]};
    const panel={element:root,update(){},dispose(){}},pages={element:overlay,update(){},dispose(){}};
    window.Worker=new Proxy(WorkerCtor,{construct(target,args){const worker=Reflect.construct(target,args),record={name:args[1]?.name,terminated:false};workers.push(record);const terminate=worker.terminate.bind(worker);worker.terminate=()=>{record.terminated=true;return terminate();};return worker;}});
    s.options.onNotice=m=>notices.push(m);
    s.options.onSaveExport=async(name,bytes,sourcePath)=>{outputs.push({name,size:bytes.length,head:String.fromCharCode(...bytes.slice(0,5)),sourcePath});return 'independent-test-output';};
    try {
      for(const kind of ['pdf','pptx']){
        s.exporting={mode:'board',title:'Independent test',state,panel,overlay:pages,stop:false};
        await s.runExport(kind);
        sample();
        if(document.querySelector('.miro-canvas-export-renderer'))throw Error('background surface leaked');
        if(p.exportJobs.size!==0)throw Error('job registry leaked');
      }
      if(await app.vault.read(f)!==text)throw Error('original file bytes changed');
      return {label:${JSON.stringify(label)},appMobile:app.isMobile,nativeSdk:window.__l20NativeSdk?.apiVersion,pluginVersion:p.manifest.version,path:f.path,baseline,samples,backgroundSamples,nativeTextSamples,outputs,workers,notices,restored:true};
    } finally {
      clearInterval(interval);
      s.exporting=original;
      s.options.onSaveExport=save;
      s.options.onNotice=notice;
      window.Worker=WorkerCtor;
      if(factories.canvas===captureFactory)factories.canvas=nativeFactory;
    }
  `), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('background export timed out; no foreground fallback')), 120000); })]);
  assert.ok(!result?.error, result?.error);
  writeFileSync(out, JSON.stringify(result, null, 2));
  assert.equal(result.outputs.length, 2, JSON.stringify(result.notices));
  assert.equal(result.outputs[0].head, '%PDF-');
  assert.ok(result.outputs[1].head.startsWith('PK'));
  assert.ok(result.samples.length > 1);
  for (const sample of result.samples) assert.deepEqual(sample, result.baseline, 'working view changed during export');
  assert.equal(result.workers.length, 2);
  assert.ok(result.workers.every(worker => worker.name === 'miro-canvas-export' && worker.terminated));
  if(expectedText.length)for(const job of [0,1])for(const text of expectedText)assert.ok(result.backgroundSamples.some(s=>s.job===job&&s.text.includes(text)), `export ${job} missing rendered text: ${text}`);
  console.log(JSON.stringify({ label, outputs: result.outputs, samples: result.samples.length, workingViewUnchanged: true, workerCleanup: true }));
} finally { clearTimeout(timer); client.close(); }
