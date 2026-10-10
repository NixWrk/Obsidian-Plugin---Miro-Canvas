import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connectByTitle,evaluate} from './cdp.mjs';
const args=process.argv.slice(2), option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const serial=option('--serial','R52Y808PDJB'),port=Number(option('--port','9340'));
const c=await connectByTitle(port,'Obsidian'),run=promisify(execFile),adb='C:/Program Files/VirtualTablet Server/adb/adb.exe';
const out=new URL('./.out/card-radius-tablet/',import.meta.url);mkdirSync(out,{recursive:true});
const receipt={serial,passed:false,checks:[]};let holding=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const check=async code=>{const r=await evaluate(c.send,`if(app.vault.getName()!=='MiroCanvasTest')throw Error('test vault required');${code}`);if(r?.error)throw Error(r.error);return r;};
const shell=async command=>(await run(adb,['-s',serial,'shell',...command],{windowsHide:true,timeout:12000})).stdout;
async function point(selector){return check(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width>0);if(!e)throw Error('missing target '+${JSON.stringify(selector)});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('target obscured');return {x,y,dpr:devicePixelRatio};`);}
async function hideKeyboard(){const dump=await shell(['dumpsys','input_method']);if(/mInputShown=true/u.test(dump)||await check("return parseFloat(getComputedStyle(document.body).getPropertyValue('--keyboard-height'))>0;")){await shell(['input','keyevent','4']);await wait(300);}}
async function tap(selector){const p=await point(selector);await shell(['input','tap',String(Math.round(p.x*p.dpr)),String(Math.round(p.y*p.dpr))]);await wait(250);}
const snap=()=>check(`const p=app.plugins.plugins['miro-canvas'],s=p.m1Session,v=app.workspace.activeLeaf.view.canvas,n=v.nodes.get('a');return {radius:v.getData().miroCanvas.localOverrides.a.cornerRadius,preview:s.radiusPreview?.radius??null,path:n.nodeEl.querySelector('.miro-source-decoration-shape path').getAttribute('d'),history:v.history.current,len:v.history.data.length,node:{x:n.x,y:n.y,width:n.width,height:n.height},geometry:s.landingGeometry().geometry.edges,lines:[...document.querySelectorAll('.miro-board-connector path')].map(e=>e.getAttribute('d')),bytes:await app.vault.read(app.workspace.getActiveFile()),control:(()=>{const h=document.querySelector('.miro-canvas-shape-radius-handle'),b=h?.querySelector('button'),v=h?.querySelector('.miro-canvas-shape-radius-handle__value'),r=b?.getBoundingClientRect();return {dragging:h?.getAttribute('data-dragging'),value:v?.textContent,valueHidden:v?.hidden,inputHidden:h?.querySelector('input')?.hidden,iconPaths:b?.querySelectorAll('svg path').length,width:r?.width,height:r?.height,x:r?.x,y:r?.y,corner:b?.querySelector('svg path')?.getAttribute('d'),direction:h?.getAttribute('data-radius-direction'),iconTransform:b?getComputedStyle(b.querySelector('svg')).transform:undefined,arrow:b?.querySelectorAll('svg path')[1]?.getAttribute('d')};})()};`);
function circular(path,width,height){const m=path.match(/A([\d.e+-]+) ([\d.e+-]+)/u);if(!m)return {radius:0};const x=Number(m[1])*width/100,y=Number(m[2])*height/100;assert.ok(Math.abs(x-y)<1e-5,`${x} vs ${y}`);return {x,y};}
try{
 receipt.device={model:(await shell(['getprop','ro.product.model'])).trim(),android:(await shell(['getprop','ro.build.version.release'])).trim(),runtime:await check("return {version:window.appVersion,userAgent:navigator.userAgent};")};
 receipt.requestedOriginal=await check("return {path:app.workspace.getActiveFile()?.path,bytes:await app.vault.read(app.workspace.getActiveFile()),keyboard:getComputedStyle(document.body).getPropertyValue('--keyboard-height')};");await hideKeyboard();receipt.fixture=await check("if(window.shapeRadiusPrior)return {path:app.workspace.getActiveFile().path};if(app.vault.getName()!==\"MiroCanvasTest\")throw Error(\"test vault required\");\nconst p=app.plugins.plugins['miro-canvas'];\nif(p.exportJobs.size)throw Error('export running');\nwindow.shapeRadiusPrior={path:app.workspace.getActiveFile().path,settings:structuredClone(p.canvasSettings),bytes:await app.vault.read(app.workspace.getActiveFile())};\nconst board={nodes:[{id:'a',type:'text',text:'Wide',x:0,y:0,width:240,height:80},{id:'b',type:'text',text:'Tall',x:340,y:0,width:120,height:240}],edges:[{id:'e',fromNode:'a',fromSide:'right',toNode:'b',toSide:'left'}],miroSource:{future:{keep:'exact'}},future:{keep:true},miroCanvas:{schemaVersion:1,localOverrides:{a:{shape:{kind:'round_rectangle',fallback:'text',future:true},cornerRadius:16,future:{keep:1}},b:{shape:{kind:'round_rectangle',fallback:'text'},cornerRadius:16}},connectors:{own:{id:'own',from:{type:'node',nodeId:'a',u:0,v:0},to:{type:'free',x:300,y:300},route:'straight',color:'#123456',width:2,startCap:'none',endCap:'arrow'},chain:{id:'chain',from:{type:'edge',edgeId:'own',t:.5},to:{type:'node',nodeId:'b',u:0,v:0},route:'straight',color:'#123456',width:2,startCap:'none',endCap:'arrow'}}}};\nconst f=await app.vault.create('Shape radius acceptance '+Date.now()+'.canvas',JSON.stringify(board));\nawait app.workspace.getLeaf(false).openFile(f,{active:true});\nawait new Promise(r=>setTimeout(r,400));\nconst c=app.workspace.activeLeaf.view.canvas;c.setViewport(120,40,1);c.selectOnly(c.nodes.get('a'));p.m1Session.refresh();\nawait new Promise(r=>setTimeout(r,400));\nreturn {path:f.path};");
 if(receipt.requestedOriginal.path)await check(`window.shapeRadiusPrior.path=${JSON.stringify(receipt.requestedOriginal.path)};window.shapeRadiusPrior.bytes=${JSON.stringify(receipt.requestedOriginal.bytes)};return true;`);
 await wait(350);
 const focus=await shell(['dumpsys','window']);assert.ok(focus.split('\n').find(l=>l.includes('mCurrentFocus='))?.includes('md.obsidian/'));
 receipt.before=await snap();receipt.checks.push({name:'equal physical corner radii',radii:circular(receipt.before.path,240,80)});
 const p=await point('.miro-canvas-shape-radius-handle__button');
 holding=true;await shell(['input','touchscreen','motionevent','DOWN',String(Math.round(p.x*p.dpr)),String(Math.round(p.y*p.dpr))]);
 await shell(['input','touchscreen','motionevent','MOVE',String(Math.round((p.x+25)*p.dpr)),String(Math.round((p.y+25)*p.dpr))]);
 await wait(120);receipt.held=await snap();
 assert.ok(receipt.held.control.x>receipt.before.control.x);assert.ok(receipt.held.control.y>receipt.before.control.y);assert.equal(receipt.held.control.corner,receipt.before.control.corner);assert.match(receipt.held.control.arrow,/M12 16v-4h4/u);assert.equal(receipt.held.control.iconTransform,"none");
 assert.equal(receipt.held.control.dragging,'true');assert.equal(receipt.held.control.valueHidden,false);assert.match(receipt.held.control.value,/Радиус|Radius/u);assert.equal(receipt.held.control.iconPaths,2);assert.equal(receipt.held.control.inputHidden,true);assert.ok(Math.abs(receipt.held.control.width-44)<.1);assert.ok(Math.abs(receipt.held.control.height-44)<.1);
 assert.equal(await check("return app.plugins.plugins['miro-canvas'].exportJobs.size;"),0);const shot=await run(adb,['-s',serial,'exec-out','screencap','-p'],{encoding:'buffer',windowsHide:true,timeout:12000,maxBuffer:16*1024*1024});writeFileSync(new URL('radius-drag-'+serial+'.png',out),shot.stdout);
 await shell(['input','touchscreen','motionevent','MOVE',String(Math.round((p.x+10)*p.dpr)),String(Math.round((p.y+10)*p.dpr))]);
 await wait(160);
 receipt.reversed=await snap();
 assert.ok(receipt.reversed.preview<receipt.held.preview&&receipt.reversed.preview>16);
 assert.equal(receipt.reversed.bytes,receipt.before.bytes);
 assert.equal(receipt.reversed.history,receipt.before.history);
 assert.ok(receipt.reversed.control.x<receipt.held.control.x);
 assert.ok(receipt.reversed.control.y<receipt.held.control.y);
 await shell(['input','touchscreen','motionevent','MOVE',String(Math.round((p.x+25)*p.dpr)),String(Math.round((p.y+25)*p.dpr))]);
 await wait(160);
 assert.ok((await snap()).control.x>receipt.reversed.control.x);
 receipt.checks.push({name:'actual ADB reversal moves marker with radius without persistence',reversedRadius:receipt.reversed.preview});


 assert.ok(receipt.held.preview>16);assert.equal(receipt.held.radius,16);assert.equal(receipt.held.bytes,receipt.before.bytes);assert.equal(receipt.held.history,receipt.before.history);assert.deepEqual(receipt.held.node,receipt.before.node);
 circular(receipt.held.path,240,80);assert.notEqual(receipt.held.path,receipt.before.path);assert.deepEqual(receipt.held.geometry.own.start,receipt.before.geometry.own.start);assert.deepEqual(receipt.held.geometry.chain.start,receipt.before.geometry.chain.start);
 await shell(['input','touchscreen','motionevent','UP',String(Math.round((p.x+25)*p.dpr)),String(Math.round((p.y+25)*p.dpr))]);holding=false;await wait(300);receipt.after=await snap();
 assert.equal(receipt.after.preview,null);assert.equal(receipt.after.control.valueHidden,true);assert.equal(receipt.after.control.dragging,'false');assert.equal(receipt.after.control.x,receipt.held.control.x);assert.equal(receipt.after.control.y,receipt.held.control.y);assert.ok(receipt.after.radius>16);assert.equal(receipt.after.history,receipt.before.history+1);assert.equal(receipt.after.path,receipt.held.path);assert.deepEqual(JSON.parse(receipt.after.bytes).miroSource,JSON.parse(receipt.before.bytes).miroSource);assert.deepEqual(JSON.parse(receipt.after.bytes).future,JSON.parse(receipt.before.bytes).future);assert.deepEqual(JSON.parse(receipt.after.bytes).miroCanvas.localOverrides.a.future,JSON.parse(receipt.before.bytes).miroCanvas.localOverrides.a.future);receipt.checks.push({name:'ADB held radius preview and one history commit',radius:receipt.after.radius});
 await tap('.miro-canvas-dock button[aria-label="Отменить"]');await wait(250);receipt.undo=await snap();assert.equal(receipt.undo.radius,16);assert.equal(receipt.undo.path,receipt.before.path);assert.equal(receipt.undo.control.x,receipt.before.control.x);assert.equal(receipt.undo.control.y,receipt.before.control.y);receipt.checks.push({name:'real ADB Undo',radius:16});
 await check("const v=app.workspace.activeLeaf.view.canvas;v.selectOnly(v.nodes.get('a'));app.plugins.plugins['miro-canvas'].m1Session.refresh();window.radiusPointerTypes=[];window.radiusPointerLogger=e=>{if(e.target.closest?.('.miro-canvas-shape-radius-handle'))window.radiusPointerTypes.push(e.pointerType);};document.addEventListener('pointerdown',window.radiusPointerLogger,true);return true;");
 await wait(1200);
 const penPoint=await point('.miro-canvas-shape-radius-handle__button');
 const penBefore=await snap();
 holding=true;
 for(const [action,delta] of [['DOWN',0],['MOVE',18]])await shell(['input','stylus','motionevent',action,String(Math.round((penPoint.x+delta)*penPoint.dpr)),String(Math.round((penPoint.y+delta)*penPoint.dpr))]);
 await wait(120);
 receipt.penHeld=await snap();
 assert.ok(receipt.penHeld.preview>16);
 assert.equal(receipt.penHeld.control.valueHidden,false);
 assert.ok(receipt.penHeld.control.x>penBefore.control.x);
 assert.ok(receipt.penHeld.control.y>penBefore.control.y);
 assert.equal(receipt.penHeld.control.corner,penBefore.control.corner);
 assert.equal(receipt.penHeld.control.inputHidden,true);
 assert.equal(receipt.penHeld.bytes,penBefore.bytes);
 assert.equal(receipt.penHeld.history,penBefore.history);
 await shell(['input','stylus','motionevent','UP',String(Math.round((penPoint.x+18)*penPoint.dpr)),String(Math.round((penPoint.y+18)*penPoint.dpr))]);
 holding=false;
 await wait(600);
 receipt.penAfter=await snap();
 assert.equal(receipt.penAfter.history,penBefore.history+1);
 assert.equal(receipt.penAfter.control.valueHidden,true);
 receipt.pointerTypes=await check("document.removeEventListener('pointerdown',window.radiusPointerLogger,true);const types=window.radiusPointerTypes;delete window.radiusPointerLogger;delete window.radiusPointerTypes;return types;");
 assert.ok(receipt.pointerTypes.includes('pen'));
 receipt.checks.push({name:'actual ADB stylus-source pen live preview and single commit (not physical S Pen)',radius:receipt.penAfter.radius,pointerTypes:receipt.pointerTypes});
 await tap('.miro-canvas-dock button[aria-label="Отменить"]');
 await wait(150);
 assert.equal((await snap()).radius,16);
 await check("const v=app.workspace.activeLeaf.view.canvas;v.selectOnly(v.nodes.get('a'));app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;");
 const q=await point('.miro-canvas-shape-radius-handle__button');holding=true;await shell(['input','touchscreen','motionevent','DOWN',String(Math.round(q.x*q.dpr)),String(Math.round(q.y*q.dpr))]);await shell(['input','touchscreen','motionevent','MOVE',String(Math.round((q.x+20)*q.dpr)),String(Math.round((q.y+20)*q.dpr))]);await wait(100);assert.ok((await snap()).preview>16);
 await shell(['input','touchscreen','motionevent','CANCEL',String(Math.round((q.x+20)*q.dpr)),String(Math.round((q.y+20)*q.dpr))]);holding=false;await wait(150);receipt.cancel=await snap();assert.equal(receipt.cancel.radius,16);assert.equal(receipt.cancel.preview,null);assert.equal(receipt.cancel.path,receipt.before.path);assert.equal(receipt.cancel.history,receipt.undo.history);receipt.checks.push({name:'real ADB pointer cancel'});
 await tap('.miro-canvas-shape-radius-handle__button');await wait(200);assert.equal(await check("return document.activeElement?.className;"),'miro-canvas-shape-radius-handle__input');
 await shell(['input','text','12']);await shell(['input','keyevent','66']);await wait(300);receipt.numeric=await snap();assert.equal(receipt.numeric.radius,12);receipt.checks.push({name:'ADB inline exact radius input',radius:12});
 const beforeToggle=receipt.numeric.bytes;
 async function settingTarget(){await check("app.setting.open();app.setting.openTabById('miro-canvas');return true;");await wait(200);return check("const d=app.setting.modalEl.ownerDocument,row=[...d.querySelectorAll('.setting-item')].find(e=>/Регулировка скругления фигур|Shape corner controls/.test(e.querySelector('.setting-item-name')?.textContent??''));if(!row)throw Error('radius toggle missing');row.scrollIntoView({block:'center'});const t=row.querySelector('.checkbox-container');if(!t)throw Error('checkbox missing');t.id='shape-radius-setting-acceptance';return {name:row.querySelector('.setting-item-name').textContent};");}
 receipt.setting=await settingTarget();await tap('#shape-radius-setting-acceptance');await check("app.setting.close();return true;");await wait(250);assert.equal(await check("return app.plugins.plugins['miro-canvas'].canvasSettings.shapeRadiusControlEnabled;"),false);assert.equal(await check("return document.querySelectorAll('.miro-canvas-shape-radius-handle').length;"),0);assert.equal((await snap()).bytes,beforeToggle);
 await settingTarget();await tap('#shape-radius-setting-acceptance');await check("app.setting.close();return true;");await wait(250);await check("const v=app.workspace.activeLeaf.view.canvas;v.selectOnly(v.nodes.get('a'));app.plugins.plugins['miro-canvas'].m1Session.refresh();return true;");assert.equal(await check("return app.plugins.plugins['miro-canvas'].canvasSettings.shapeRadiusControlEnabled;"),true);assert.ok(await check("return document.querySelector('.miro-canvas-shape-radius-handle')!==null;"));receipt.checks.push({name:'ADB native settings toggle preserves radius'});
 await tap('button[data-tool="shape"]');await tap('button[data-shape="rectangle"]');
 const idsBefore=await check("return [...app.workspace.activeLeaf.view.canvas.nodes.keys()];");const dpr=await check('return devicePixelRatio;');await shell(['input','tap',String(Math.round(550*dpr)),String(Math.round(900*dpr))]);await wait(250);receipt.clickCreated=await check(`const v=app.workspace.activeLeaf.view.canvas,old=${JSON.stringify(idsBefore)};return [...v.nodes.values()].filter(n=>!old.includes(n.id)).map(n=>({id:n.id,width:n.width,height:n.height}));`);assert.equal(receipt.clickCreated.length,1);assert.equal(receipt.clickCreated[0].width,240);assert.equal(receipt.clickCreated[0].height,160);receipt.checks.push({name:'ADB click creates wide rectangle240x160'});
 await wait(500);await hideKeyboard();await wait(300);await tap('button[data-tool="shape"]');await tap('button[data-shape="rectangle"]');const dragIds=await check("return [...app.workspace.activeLeaf.view.canvas.nodes.keys()];");await shell(['input','swipe',String(Math.round(200*dpr)),String(Math.round(900*dpr)),String(Math.round(380*dpr)),String(Math.round(1030*dpr)),'500']);await wait(250);receipt.dragCreated=await check(`const v=app.workspace.activeLeaf.view.canvas,old=${JSON.stringify(dragIds)};return {scale:v.scale,nodes:[...v.nodes.values()].filter(n=>!old.includes(n.id)).map(n=>({id:n.id,width:n.width,height:n.height}))};`);assert.equal(receipt.dragCreated.nodes.length,1);assert.ok(Math.abs(receipt.dragCreated.nodes[0].width-180/receipt.dragCreated.scale)<2);assert.ok(Math.abs(receipt.dragCreated.nodes[0].height-130/receipt.dragCreated.scale)<2);receipt.checks.push({name:'ADB free drag retains drawn rectangle dimensions',created:receipt.dragCreated});
 receipt.passed=true;
}catch(e){receipt.error=e.stack;throw e;}finally{
 try{await hideKeyboard();if(holding)await shell(['input','touchscreen','motionevent','CANCEL','0','0']);await check("if(window.radiusPointerLogger)document.removeEventListener('pointerdown',window.radiusPointerLogger,true);delete window.radiusPointerLogger;delete window.radiusPointerTypes;return true;");receipt.restore=await check(`const prior=window.shapeRadiusPrior;if(!prior)return false;const p=app.plugins.plugins['miro-canvas'];await p.saveCanvasSettings(prior.settings);const f=app.vault.getAbstractFileByPath(prior.path);if(!f)throw Error('original missing');await app.workspace.getLeaf(false).openFile(f,{active:true});const unchanged=await app.vault.read(f)===prior.bytes;delete window.shapeRadiusPrior;return {path:f.path,unchanged};`);}finally{writeFileSync(new URL('native-'+serial+'.json',out),JSON.stringify(receipt,null,2));c.close();}
}
console.log(JSON.stringify({serial,passed:receipt.passed,checks:receipt.checks,restore:receipt.restore}));
