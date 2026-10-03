import {board, checked, finish} from './_mobile.mjs';

export async function prepare(s) {
  await board(s, s.lang === 'ru' ? 'Панели — удобное место.canvas' : 'Panels — a comfortable place.canvas', {arrange:true});
  await s.caption({ru:'Откройте «Настроить панели»',en:'Open “Arrange panels”'});
}

export default async function(s) {
  await s.wait(1300);
  await s.touchTap({selector:'.miro-canvas-dock button:has(.lucide-settings-2)'});
  await s.touchTap({selector:'.miro-canvas-dock__menu--board [role="menuitem"]',textRu:'Настроить панели',textEn:'Arrange panels'});
  const viewport = await checked(s, 'return {w:innerWidth,h:innerHeight};');
  const phone = viewport.w < 500;
  await s.caption(phone
    ? {ru:'Перенесём навигацию к левому краю',en:'Move navigation to the left edge'}
    : {ru:'Поставим инструменты у левого края',en:'Place the tools along the left edge'});
  const panel = phone ? '.miro-canvas-dock' : '.miro-canvas-tools';
  await s.touchTap({selector:panel + ' .miro-canvas-arrange-flip'});
  await s.wait(700);
  await s.touchDrag({selector:panel + ' .miro-canvas-arrange-grip'},
    {x:phone ? 35 : 55,y:viewport.h * (phone ? .43 : .24)}, {duration:1300});
  await s.wait(900);
  await checked(s, `
    const button = document.querySelector('.miro-canvas-arrange-banner__button--done');
    const rect = button.getBoundingClientRect();
    if(rect.left < 0 || rect.right > innerWidth) throw Error('Done button outside the screen');
    return true;
  `);
  await s.touchTap({selector:'.miro-canvas-arrange-banner__button--done'});
  await s.wait(700);
  await checked(s, `
    if(document.querySelector('.miro-canvas-arrange-banner')) throw Error('arrange mode still open');
    const panel = document.querySelector(${JSON.stringify(panel)});
    if(panel.getAttribute('data-miro-canvas-panel-orientation') !== 'vertical') throw Error('panel was not turned');
    return true;
  `);
  await finish(s, phone
    ? {ru:'Частые инструменты снизу, навигация сбоку',en:'Frequent tools below, navigation at the side'}
    : {ru:'Инструменты сбоку, навигация снизу',en:'Tools at the side, navigation below'});
}
