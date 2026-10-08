import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  await board(s,s.lang==='ru'?'Удобное место для панелей.canvas':'Arrange panels.canvas',{nodes:[{id:'a100000000000001',type:'text',text:s.lang==='ru'?'Рабочее место под себя':'Make room for your work',x:100,y:-100,width:340,height:200}],edges:[]});
  await s.caption({ru:'1. Меню доски → «Настроить панели»',en:'1. Board menu → Arrange panels'});
}
export default async function(s){
  await s.wait(1200);
  await click(s,{selector:'.miro-canvas-dock button:has(.lucide-settings-2)'});
  await click(s,{selector:'.miro-canvas-dock__menu--board [role="menuitem"]',textRu:'Настроить панели',textEn:'Arrange panels'});
  await s.caption({ru:'2. Поверните панель и перенесите к левому краю',en:'2. Turn the toolbar and place it on the left'});
  await click(s,{selector:'.miro-canvas-tools .miro-canvas-arrange-flip'});
  const grip=await s.find({selector:'.miro-canvas-tools .miro-canvas-arrange-grip'});
  await s.move(grip,{duration:650});
  await s.drag(grip,{x:110,y:190},{duration:1400});
  await s.caption({ru:'3. Переставьте инструмент и нажмите «Готово»',en:'3. Reorder a tool and press Done'});
  await s.drag({selector:'.miro-canvas-tools [data-tool="text"]'},{selector:'.miro-canvas-tools [data-tool="shape"]'},{duration:1600});
  await s.wait(500);
  await click(s,{selector:'.miro-canvas-arrange-banner__button--done'});
  await checked(s,`const tools=document.querySelector('.miro-canvas-tools'),card=document.querySelector('[data-demo-id="a100000000000001"]');const t=tools.getBoundingClientRect(),c=card.getBoundingClientRect();if(document.querySelector('.miro-canvas-arrange-banner')||tools.getAttribute('data-miro-canvas-panel-orientation')!=='vertical'||t.right>c.left)throw Error('toolbar was not placed beside the work');return true;`);
  await finish(s,{ru:'Инструменты сбоку; карточки остаются открытыми',en:'Tools at the side, with room for your cards'});
}
