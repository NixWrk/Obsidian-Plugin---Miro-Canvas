import {board, checked, finish} from './_mobile.mjs';

export async function prepare(s) {
  await board(s, s.lang==='ru'?'Рисование — перо и палец.canvas':'Drawing — pen and finger.canvas');
  await checked(s, `const p=app.plugins.plugins['miro-canvas'];await p.saveCanvasSettings({penPressure:false,fingerDrawing:false,holdStraightLine:false});const c=app.workspace.activeLeaf.view.canvas;c.clear();c.importData({nodes:[],edges:[]});c.setViewport(0,0,0);p.m1Session.setTheme(${JSON.stringify(s.theme)});p.m1Session.armTool('pen');p.m1Session.penWidth=14;p.m1Session.penColor='#7954cb';return true;`);
  await s.wait(800);
  await s.caption({ru:'Нажим меняет толщину прямо во время рисования',en:'Pressure changes width while you draw'});
}

export default async function(s) {
  await s.caption({ru:'1. Настройки → Miro Canvas → Рисование',en:'1. Settings → Miro Canvas → Drawing'});
  await checked(s,"app.setting.open();app.setting.openTabById('miro-canvas');return true;");
  for (const [textEn,textRu] of [['Pen pressure','Учитывать нажим пера'],['Draw with a finger','Рисовать пальцем']]) {
    await checked(s,`const rows=[...document.querySelectorAll('.setting-item')];const row=rows.find(x=>x.querySelector('.setting-item-name')?.textContent===${JSON.stringify(s.lang==='ru'?textRu:textEn)});if(!row)throw Error('drawing setting missing');row.scrollIntoView({block:'center'});return true;`);
    await s.wait(400);
    const toggle=await s.find({selector:'.setting-item',textEn,textRu,controlSelector:'.checkbox-container'});
    await s.touchTap(toggle);
  }
  await s.wait(700);
  await checked(s,"app.setting.close();const p=app.plugins.plugins['miro-canvas'];if(!p.canvasSettings.penPressure||!p.canvasSettings.fingerDrawing)throw Error('drawing settings not enabled');p.m1Session.armTool('pen');p.m1Session.penWidth=14;return true;");
  await s.caption({ru:'2. Нажим меняет толщину во время рисования',en:'2. Pressure changes width while you draw'});
  await s.wait(1100);
  const viewport=await checked(s,'return {w:innerWidth,h:innerHeight};');
  const points=Array.from({length:61},(_,i)=>({x:viewport.w*.25+i*viewport.w*.008,y:viewport.h*.4+Math.sin(i/60*Math.PI*2)*35,pressure:.06+.74*Math.sin(i/60*Math.PI)**2}));
  await s.penStroke(points,{duration:2600});
  await s.wait(1200);
  await checked(s,`const c=app.workspace.activeLeaf.view.canvas;const strokes=Object.values(c.getData().miroCanvas.localOverrides).map(o=>o.item?.stroke).filter(Boolean);if(!strokes.some(x=>new Set(x.widths).size>10))throw Error('pressure not saved');return true;`);
  await s.caption({ru:'Рисование пальцем включается отдельно',en:'Finger drawing has its own setting'});
  await s.wait(1800);
  await s.touchDrag({x:viewport.w*.26,y:viewport.h*.53},{x:viewport.w*.69,y:viewport.h*.60},{duration:1600});
  await s.wait(1000);
  await s.caption({ru:'Два пальца приближают доску',en:'Two fingers zoom the board'});
  await s.touchPinch({x:viewport.w*.50,y:viewport.h*.5},100,160);
  await checked(s,`const c=app.workspace.activeLeaf.view.canvas;if(c.nodes.size!==2)throw Error('pinch left a drawing');return true;`);
  await s.caption({ru:'Двойной тап убирает перо и не оставляет точек',en:'Double tap puts the pen away without dots'});
  const tap={x:viewport.w*.75,y:viewport.h*.72,pressure:.5};
  await s.penStroke([tap]);
  await s.penStroke([tap]);
  await s.wait(800);
  await checked(s,"const p=app.plugins.plugins['miro-canvas'];const c=app.workspace.activeLeaf.view.canvas;if(c.nodes.size!==2||p.m1Session.armedTool!=='select')throw Error('double tap left ink');return true;");
  await finish(s,{ru:'Нажим и рисование пальцем можно выключить в настройках',en:'Turn pressure and finger drawing off in settings'});
}
