import {board, checked, finish} from './_mobile.mjs';

export async function prepare(s) {
  await board(s, s.lang === 'ru' ? 'Панели — удобное место.canvas' : 'Panels — a comfortable place.canvas', {arrange:true});
  await s.caption({ru:'Откройте «Настроить панели»',en:'Open “Arrange panels”'});
}

export default async function(s) {
  await s.wait(350);
  await s.touchTap({selector:'.miro-canvas-dock button:has(.lucide-settings-2)'});
  await s.touchTap({selector:'.miro-canvas-dock__menu--board [role="menuitem"]',textRu:'Настроить панели',textEn:'Arrange panels'});
  const viewport = await checked(s, 'return {w:innerWidth,h:innerHeight};');
  const phone = viewport.w < 500;
  await s.caption(phone
    ? {ru:'Перенесём навигацию к левому краю',en:'Move navigation to the left edge'}
    : {ru:'Поставим инструменты у левого края',en:'Place the tools along the left edge'});
  const panel = phone ? '.miro-canvas-dock' : '.miro-canvas-tools';
  await s.touchTap({selector:panel + ' .miro-canvas-arrange-flip'});
  await s.wait(350);
  await s.touchDrag({selector:panel + ' .miro-canvas-arrange-grip'},
    {x:phone ? 35 : 55,y:viewport.h * (phone ? .43 : .24)}, {duration:1000});
  await s.wait(500);
  await s.caption({ru:'Линия показывает новое место инструмента',en:'The line shows where the tool will go'});
  const shape = await s.find({selector:'.miro-canvas-tools [data-tool="shape"]'});
  await s.touchDrag({selector:'.miro-canvas-tools [data-tool="text"]'}, shape, {duration:1200});
  await s.wait(350);
  await checked(s, `
    const items = app.plugins.plugins['miro-canvas'].canvasSettings.toolbarItems;
    if(items.indexOf('text') === 2) throw Error('tool order did not change');
    if(document.querySelector('.miro-canvas-arrange-insertion')) throw Error('insertion line remained after release');
    return true;
  `);
  await s.caption({ru:'Нужный инструмент можно перенести из «+»',en:'Drag a spare tool out of “+”'});
  await s.touchTap({selector:'.miro-canvas-tools__more > button'});
  await s.wait(650);
  const destination = await s.find({selector:'.miro-canvas-tools > .miro-canvas-toolbar__bar > [data-tool="sticky"]'});
  await s.touchDrag({selector:'.miro-canvas-tools__more [data-tool="code"]'}, destination, {duration:1600});
  await checked(s, `
    if(!app.plugins.plugins['miro-canvas'].canvasSettings.toolbarItems.includes('code')) throw Error('spare tool was not added: '+JSON.stringify({items:app.plugins.plugins['miro-canvas'].canvasSettings.toolbarItems,layout:app.plugins.plugins['miro-canvas'].canvasSettings.panelLayout,bar:document.querySelector('.miro-canvas-tools > .miro-canvas-toolbar__bar').getBoundingClientRect().toJSON()}));
    return true;
  `);
  await s.wait(350);
  await checked(s, `
    const button = document.querySelector('.miro-canvas-arrange-banner__button--done');
    const rect = button.getBoundingClientRect();
    if(rect.left < 0 || rect.right > innerWidth) throw Error('Done button outside the screen');
    return true;
  `);
  await s.touchTap({selector:'.miro-canvas-arrange-banner__button--done'});
  await s.wait(350);
  await checked(s, `
    if(document.querySelector('.miro-canvas-arrange-banner')) throw Error('arrange mode still open');
    const panel = document.querySelector(${JSON.stringify(panel)});
    if(panel.getAttribute('data-miro-canvas-panel-orientation') !== 'vertical') throw Error('panel was not turned');
    return true;
  `);
  await s.caption({ru:'Касание сворачивает, удержание позволяет передвинуть',en:'Tap to fold; hold to move'});
  await s.touchTap({selector:'.miro-canvas-tools .miro-canvas-panel-toggle'});
  await s.touchTap({selector:'.miro-canvas-dock .miro-canvas-panel-toggle'});
  await s.wait(450);
  await s.touchDrag({selector:'.miro-canvas-tools .miro-canvas-panel-toggle'}, {x:viewport.w-50,y:viewport.h*.45}, {duration:1000,hold:550});
  await checked(s, `
    for(const selector of ['.miro-canvas-tools','.miro-canvas-dock']) {
      const panel=document.querySelector(selector);
      if(panel.getAttribute('data-miro-canvas-panel-collapsed')!=='true') throw Error('panel expanded during movement');
      if(Math.abs(panel.getBoundingClientRect().width-44)>2) throw Error('collapsed panel is not compact');
    }
    return true;
  `);
  await s.wait(350);
  await s.touchTap({selector:'.miro-canvas-tools .miro-canvas-panel-toggle'});
  await s.wait(350);
  await s.touchDrag({selector:'.miro-canvas-tools .miro-canvas-panel-toggle'}, {x:viewport.w-80,y:viewport.h*(phone ? .65 : .35)}, {duration:1000,hold:550});
  await checked(s, `if(document.querySelector('.miro-canvas-tools').getAttribute('data-miro-canvas-panel-collapsed')==='true') throw Error('open panel folded during movement'); return true;`);
  await finish(s,{ru:'Панели можно передвигать и раскрытыми, и свёрнутыми',en:'Move panels folded or open'});
}
