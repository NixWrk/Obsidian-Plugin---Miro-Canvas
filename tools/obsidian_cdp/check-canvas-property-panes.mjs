// Real search/outgoing panes, with no foreground activation or screen capture.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connectByTitle, evaluate } from './cdp.mjs';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option('--port', '9346'));
const serial = option('--serial');
const client = await connectByTitle(port, serial ? 'Obsidian' : undefined);
const run = promisify(execFile);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = { device: serial ?? 'Windows', input: serial ? 'ADB taps; CDP text and pane preparation' : 'trusted CDP renderer input; pane preparation', checks: [], passed: false };
async function checked(body) {
  let timer;
  try {
    const result = await Promise.race([evaluate(client.send, `
      if(app.isMobile ? app.vault.getName()!=='MiroCanvasTest' : !app.vault.adapter.basePath.replaceAll('\\\\','/').includes('/l20-windows/vault'))throw Error('test vault required');
      if(!app.isMobile){const w=require('@electron/remote').getCurrentWindow();if(w.isVisible()||w.isFocused())throw Error('hidden window required');}
      ${body}`), new Promise((_,reject) => { timer=setTimeout(()=>reject(Error('Obsidian suspended')),20000); })]);
    if(result?.error)throw Error(result.error);
    return result;
  } finally { clearTimeout(timer); }
}
async function tap(selector, outgoingPath) {
  const point = await checked(`const view=${outgoingPath ? `app.workspace.getLeavesOfType('outgoing-link').find(l=>l.view.file?.path===${JSON.stringify(outgoingPath)}&&l.view.containerEl.getBoundingClientRect().width).view` : 'app.workspace.activeLeaf.view'};for(const e of view.containerEl.querySelectorAll(${JSON.stringify(selector)})){if(!e.getBoundingClientRect().width)continue;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};if(e.contains(document.elementFromPoint(p.x,p.y)))return p;}throw Error('missing or obscured control '+${JSON.stringify(selector)});`);
  if(serial){
    const adb=process.env.ADB??'C:/Program Files/VirtualTablet Server/adb/adb.exe';
    const focus=await run(adb,['-s',serial,'shell','dumpsys window'],{windowsHide:true,timeout:12000});
    assert.ok(focus.stdout.split('\n').find(l=>l.includes('mCurrentFocus='))?.includes('md.obsidian/'));
    const dpr=await checked('return devicePixelRatio;');
    receipt.inputs??=[];
    receipt.inputs.push(await checked(`return {point:${JSON.stringify(point)},dpr:devicePixelRatio,height:innerHeight,keyboard:getComputedStyle(document.body).getPropertyValue('--keyboard-height'),visual:{height:visualViewport?.height,offsetTop:visualViewport?.offsetTop},target:document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,180)};`));
    await run(adb,['-s',serial,'shell','input','tap',String(Math.round(point.x*dpr)),String(Math.round(point.y*dpr))],{windowsHide:true,timeout:12000});
  }else{
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
  }
  await wait(300);
}
async function waitForFile(path) {
  const deadline=Date.now()+7000;
  let actual;
  do {
    actual=await checked('return app.workspace.getActiveFile()?.path;');
    if(actual===path)return;
    await wait(200);
  } while(Date.now()<deadline);
  assert.equal(actual,path);
}
let prior;
try {
  prior=await checked('return app.workspace.getActiveFile()?.path;');
  const path=`Canvas property pane ${Date.now()}.canvas`;
  receipt.path=path;
  await checked(`await app.vault.create(${JSON.stringify(path)},JSON.stringify({nodes:[],edges:[],miroCanvas:{schemaVersion:1,properties:{status:'pane-acceptance',related:'[[Feature Reference]]'}}}));
    const l=app.isMobile?app.workspace.getLeftLeaf(false):app.workspace.getLeaf(false);await l.setViewState({type:'search'});if(app.isMobile)await app.workspace.revealLeaf(l);app.workspace.setActiveLeaf(l,{focus:false});app.workspace.leftSplit.expand();return true;`);
  await wait(1300);
  await tap('.global-search-input-container input');
  await client.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
  await client.send('Input.insertText',{text:'[status:"pane-acceptance"]'});
  let search;
  const deadline=Date.now()+12000;
  do {
    await wait(300);
    search=await checked(`const v=app.workspace.activeLeaf.view;return {query:v.searchComponent.getValue(),text:v.containerEl.textContent,rows:[...v.containerEl.querySelectorAll('[data-canvas-property-path]')].map(e=>e.dataset.canvasPropertyPath)};`);
  } while(!search.rows.includes(path)&&Date.now()<deadline);
  receipt.checks.push({name:'native typed property query shows real Canvas file result',search});
  assert.ok(search.rows.includes(path),JSON.stringify(search));
  await tap('[data-canvas-property-path='+JSON.stringify(path)+']');
  await waitForFile(path);
  receipt.checks.push({name:'property result click opens the genuine board'});
  await checked(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(path)}),l=app.workspace.getRightLeaf(false);await l.setViewState({type:'outgoing-link',state:{file:f.path}});if(app.isMobile)await app.workspace.revealLeaf(l);app.workspace.rightSplit.expand();app.workspace.setActiveLeaf(l,{focus:false});await l.view.loadFile(f);return true;`);
  await wait(1300);
  let outgoing;
  const outgoingDeadline=Date.now()+12000;
  do {
    outgoing=await checked(`const v=app.workspace.getLeavesOfType('outgoing-link').find(l=>l.view.file?.path===${JSON.stringify(path)}&&l.view.containerEl.getBoundingClientRect().width).view,b=v.outgoingLink;v.onResize();b.outgoingLinkInfinityScroller.compute();return {source:v.file.path,count:b.linksCountEl.textContent,rows:[...v.containerEl.querySelectorAll('.outgoing-link-item')].map(e=>e.textContent),size:{width:b.outgoingLinkInfinityScroller.width,height:b.outgoingLinkInfinityScroller.height}};`);
    if(outgoing.rows.includes('Feature Reference'))break;
    await wait(300);
  } while(Date.now()<outgoingDeadline);
  receipt.checks.push({name:'native outgoing pane renders property destination',outgoing});
  assert.ok(outgoing.rows.includes('Feature Reference'),JSON.stringify(outgoing));
  assert.equal(outgoing.count,'1');
  await tap('.outgoing-link-item', path);
  await waitForFile('Feature Reference.md');
  receipt.checks.push({name:'outgoing link click opens the actual note'});
  receipt.passed=true;
  console.log(JSON.stringify(receipt));
} finally {
  if(prior)await checked(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(prior)});if(f)await app.workspace.getLeaf(false).openFile(f,{active:true});return true;`).catch(e=>{receipt.restoreError=String(e);});
  writeFileSync(new URL(`.out/feature-expansion/native-property-panes-${serial??'Windows'}.json`,import.meta.url),JSON.stringify(receipt,null,2));
  client.close();
}
