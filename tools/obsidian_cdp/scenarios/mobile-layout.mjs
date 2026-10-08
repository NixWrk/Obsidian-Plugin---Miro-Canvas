import {board,checked,finish} from './_mobile.mjs';
export async function prepare(s){
  await board(s,s.lang==='ru'?'Панели — удобное место.canvas':'Panels — a comfortable place.canvas',{arrange:true});
  await s.caption({ru:'1. Меню доски → «Настроить панели»',en:'1. Board menu → Arrange panels'});
}
export default async function(s){
  await s.wait(1200);
  await s.touchTap({selector:'.miro-canvas-dock button:has(.lucide-settings-2)'});
  await s.touchTap({selector:'.miro-canvas-dock__menu--board [role="menuitem"]',textRu:'Настроить панели',textEn:'Arrange panels'});
  const viewport=await checked(s,'return {w:innerWidth,h:innerHeight};');
  const phone=viewport.w<500;
  const panel=phone?'.miro-canvas-dock':'.miro-canvas-tools';
  await s.caption(phone?{ru:'2. Поверните навигацию и поставьте у края',en:'2. Turn navigation and place it at the edge'}:{ru:'2. Поверните инструменты и поставьте слева',en:'2. Turn the tools and place them on the left'});
  await s.touchTap({selector:panel+' .miro-canvas-arrange-flip'});
  await s.touchDrag({selector:panel+' .miro-canvas-arrange-grip'},{x:phone?35:55,y:viewport.h*(phone?.43:.24)},{duration:1400});
  await s.caption({ru:'3. Нажмите «Готово» и продолжайте работу',en:'3. Press Done and get back to your board'});
  await s.touchTap({selector:'.miro-canvas-arrange-banner__button--done'});
  await checked(s,`const panel=document.querySelector(${JSON.stringify(panel)});const p=panel.getBoundingClientRect();if(document.querySelector('.miro-canvas-arrange-banner')||panel.getAttribute('data-miro-canvas-panel-orientation')!=='vertical'||p.left>100)throw Error('panel not at the left edge');return true;`);
  await finish(s,{ru:'Панели доступны и не закрывают карточки',en:'Keep controls nearby and your cards clear'});
}
