import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  const ru=s.lang==='ru';
  await board(s,ru?'Размер миникарты.canvas':'Minimap size.canvas',{nodes:[
    {id:'map-a',type:'text',text:ru?'Идеи':'Ideas',x:-180,y:-80,width:260,height:180,color:'3'},
    {id:'map-b',type:'text',text:ru?'Следующие шаги':'Next steps',x:1000,y:120,width:260,height:180,color:'4'},
    {id:'map-c',type:'text',text:ru?'На следующей неделе':'Next week',x:1350,y:-130,width:260,height:180,color:'6'}],
    edges:[{id:'map-line',fromNode:'map-a',fromSide:'right',toNode:'map-b',toSide:'left'}],miroCanvas:{schemaVersion:1,settings:{minimapVisible:true}}});
  await checked(s,`await app.plugins.plugins['miro-canvas'].saveCanvasSettings({minimapVisible:true,panelLayout:{minimap:{anchor:'top-left',dx:70,dy:120}}});return true;`);
  await s.wait(700);
  await s.caption({ru:'1. Меню доски → «Настроить панели»',en:'1. Board menu → Arrange panels'});
}
export default async function(s){
  await s.wait(1200);
  await click(s,{selector:'.miro-canvas-dock button:has(.lucide-settings-2)'});
  await click(s,{selector:'.miro-canvas-dock__menu--board [role="menuitem"]',textRu:'Настроить панели',textEn:'Arrange panels'});
  await s.caption({ru:'2. Потяните за угол миникарты',en:'2. Drag the minimap corner'});
  const corner=await s.find({selector:'.miro-canvas-arrange-resize'});
  await s.move(corner,{duration:650});
  await s.drag(corner,{x:corner.x+120,y:corner.y+80},{duration:1500});
  await click(s,{selector:'.miro-canvas-arrange-banner__button--done'});
  await checked(s,`const p=app.plugins.plugins['miro-canvas'];if(p.canvasSettings.panelLayout.minimap.width<280)throw Error('minimap size not saved');const c=p.m1Session.controls.minimapCanvas;const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;if(!pixels.some((value,index)=>index%4===3&&value>0))throw Error('minimap is blank');return true;`);
  await finish(s,{ru:'Больше места для обзора большой доски',en:'Make a large board easier to navigate'});
}
