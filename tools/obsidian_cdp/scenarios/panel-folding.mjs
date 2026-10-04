import {board, checked, finish} from './_mobile.mjs';
const selector = '.miro-canvas-tools .miro-canvas-panel-toggle';
async function point(s) {
  return checked(s, `const b=document.querySelector('${selector}');const r=b.getBoundingClientRect();return {x:r.x+22,y:r.y+22,background:getComputedStyle(b).backgroundColor};`);
}
async function samePoint(s, pivot) {
  const next=await point(s);
  if(Math.hypot(next.x-pivot.x,next.y-pivot.y)>1)throw Error('fold button moved');
  if(next.background!=='rgba(0, 0, 0, 0)')throw Error('sticky fold background');
}
export async function prepare(s) {
  await board(s,s.lang==='ru'?'Проверка сворачивания.canvas':'Panel folding check.canvas');
  await checked(s,`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({panelLayout:{toolbar:{anchor:'top-left',dx:40,dy:120,orientation:'vertical'}}});return true;`);
  await s.wait(800);
  await s.caption({ru:'Кнопка остаётся на месте после нескольких открытий',en:'The button stays in place after repeated folding'});
}
export default async function(s) {
  let pivot=await point(s);
  for(let cycle=0;cycle<6;cycle++) {
    await s.touchTap({selector});
    await samePoint(s,pivot);
  }
  await s.caption({ru:'Удерживайте кнопку, чтобы перенести открытую панель',en:'Hold the button to move the open panel'});
  await s.touchDrag({selector},{x:150,y:330},{duration:900,hold:550});
  pivot=await point(s);
  await s.touchTap({selector});
  await samePoint(s,pivot);
  await s.caption({ru:'Свёрнутую панель тоже можно передвинуть',en:'The folded panel can be moved too'});
  await s.touchDrag({selector},{x:120,y:700},{duration:900,hold:550});
  pivot=await point(s);
  await s.touchTap({selector});
  await samePoint(s,pivot);
  await finish(s,{ru:'Без смещения кнопки и остающегося серого фона',en:'No button drift or lingering grey background'});
}
