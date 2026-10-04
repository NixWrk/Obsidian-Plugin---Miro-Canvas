import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  await board(s,s.lang==='ru'?'Удобное место для панелей.canvas':'Arrange panels.canvas',{nodes:[{id:'a100000000000001',type:'text',text:s.lang==='ru'?'Рабочее место под себя':'Make room for your work',x:100,y:-100,width:340,height:200}],edges:[]});
  await s.caption({ru:'1. Настроим расположение панелей',en:'1. Choose where your panels sit'});
}
export default async function(s){
  await s.wait(1100);
  await click(s,{selector:'.miro-canvas-dock button:has(.lucide-settings-2)'});
  await click(s,{selector:'.miro-canvas-dock__menu--board [role="menuitem"]',textRu:'Настроить панели',textEn:'Arrange panels'});
  const grip=await s.find({selector:'.miro-canvas-tools .miro-canvas-arrange-grip'});
  await s.move(grip,{duration:650});
  await s.drag(grip,{x:220,y:220},{duration:1400});
  await s.caption({ru:'2. Повернём панель столбцом',en:'2. Turn the toolbar into a column'});
  await click(s,{selector:'.miro-canvas-tools .miro-canvas-arrange-flip'});
  await s.caption({ru:'3. Переставим инструмент по линии вставки',en:'3. Reorder a tool using the insertion line'});
  await s.drag({selector:'.miro-canvas-tools [data-tool="text"]'},{selector:'.miro-canvas-tools [data-tool="shape"]'},{duration:1600});
  await s.wait(700);
  await s.caption({ru:'4. Свернём панель и перенесём её после удержания',en:'4. Fold the panel, then hold to move it'});
  await click(s,{selector:'.miro-canvas-tools .miro-canvas-panel-toggle'});
  await s.drag({selector:'.miro-canvas-tools .miro-canvas-panel-toggle'},{x:700,y:250},{duration:1400,hold:650});
  await checked(s,`if(document.querySelector('.miro-canvas-tools').getAttribute('data-miro-canvas-panel-collapsed')!=='true') throw Error('folded drag expanded panel'); return true;`);
  await click(s,{selector:'.miro-canvas-arrange-banner__button--done'});
  await finish(s,{ru:'Касание раскрывает, удержание позволяет передвинуть',en:'Tap to open; hold to move'});
}
