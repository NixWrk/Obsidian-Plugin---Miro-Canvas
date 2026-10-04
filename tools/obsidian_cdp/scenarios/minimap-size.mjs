import {board, checked, finish} from './_mobile.mjs';
export async function prepare(s) {
  await board(s,s.lang==='ru'?'Миникарта — удобный размер.canvas':'Minimap — choose a size.canvas',{arrange:true});
  await checked(s,`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({minimapVisible:true,panelLayout:{minimap:{anchor:'top-left',dx:110,dy:90}}});return true;`);
  await s.wait(500);
  await s.caption({ru:'Миникарту тоже можно настроить',en:'Make the minimap fit your board'});
}
export default async function(s) {
  await s.wait(1500);
  await s.touchTap({selector:'.miro-canvas-dock button:has(.lucide-settings-2)'});
  await s.touchTap({selector:'.miro-canvas-dock__menu--board [role="menuitem"]',textRu:'Настроить панели',textEn:'Arrange panels'});
  await s.wait(1000);
  await s.caption({ru:'Потяните за угол, чтобы изменить размер',en:'Drag the corner to resize'});
  const at=await s.find({selector:'.miro-canvas-arrange-resize'});
  await s.touchDrag(at,{x:at.x+145,y:at.y+100},{duration:1800});
  await checked(s,`const size=app.plugins.plugins['miro-canvas'].canvasSettings.panelLayout.minimap;if(!size?.width||size.width<280)throw Error('minimap size not saved');return true;`);
  await s.wait(1200);
  await s.touchTap({selector:'.miro-canvas-arrange-banner__button--done'});
  await s.touchDrag({selector:'.miro-canvas-panel__minimap-canvas'},{x:200,y:270},{duration:600});
  await finish(s,{ru:'Размер сохраняется для этого устройства',en:'The size is saved for this device'});
}
